const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ===========================================
// CONFIGURAÇÕES GLOBAIS DO JOGO
// ===========================================
const NUM_MAXIMO_BOLINHAS = 75;
const INTERVALO_SORTEIO = 5000; // 5 segundos para o sorteio cronometrado

// Variáveis para controlar salas, timers e o estado do jogo
const salas = {}; // { salaID: { numeros: [], jogadores: [], hostId: '', tipoPartida: '', timerSorteio: null } }

// Funções utilitárias
function gerarNovoNumero(numerosSorteados) {
    const todos = Array.from({ length: NUM_MAXIMO_BOLINHAS }, (_, i) => i + 1);
    const naoSorteados = todos.filter(num => !numerosSorteados.includes(num));

    if (naoSorteados.length === 0) {
        return null; // Fim de jogo
    }

    const indiceAleatorio = Math.floor(Math.random() * naoSorteados.length);
    return naoSorteados[indiceAleatorio];
}

// ===========================================
// LÓGICA DO SORTEIO (CRÍTICO)
// ===========================================

function sortearProximoNumero(salaId) {
    const sala = salas[salaId];
    if (!sala) return;

    const novoNumero = gerarNovoNumero(sala.numeros);

    if (novoNumero !== null) {
        sala.numeros.push(novoNumero);
        console.log(`[Sala ${salaId}] Novo número sorteado: ${novoNumero}`);

        // Emite o novo número para todos os clientes na sala
        io.to(salaId).emit('novoNumero', {
            numero: novoNumero,
            todos: sala.numeros
        });
        
        // Atualiza o placar e verifica vitórias
        atualizarPlacar(salaId);

    } else {
        // Fim de jogo
        io.to(salaId).emit('fimDeJogo', 'FIM DE JOGO! Todas as 75 bolinhas foram sorteadas.');
        if (sala.timerSorteio) {
            clearInterval(sala.timerSorteio);
            sala.timerSorteio = null;
        }
    }
}

function atualizarPlacar(salaId) {
    const sala = salas[salaId];
    if (!sala) return;
    
    // Verifica se algum jogador é o vencedor para exibição
    const placarData = sala.jogadores.map(jogador => ({
        nome: jogador.nome,
        status: jogador.status || 'Jogando',
        id: jogador.id
    }));
    
    io.to(salaId).emit('placarAtualizado', placarData);
}

// ===========================================
// LÓGICA DE SALAS E CONEXÃO
// ===========================================

io.on('connection', (socket) => {
    let salaId;
    let usuario = {};

    socket.on('entrarSala', (dados) => {
        usuario = dados;
        
        // Lógica de sala Pública/Privada
        if (dados.tipoSala === 'privada' && dados.salaID) {
            salaId = dados.salaID;
        } else {
            // Lógica de Sala Pública (simples: todos na mesma sala)
            salaId = 'SALA_PUBLICA';
        }

        socket.join(salaId);

        // Inicializa ou junta-se à sala
        if (!salas[salaId]) {
            // Novo Host/Sala
            salas[salaId] = {
                numeros: [],
                jogadores: [],
                hostId: socket.id,
                tipoPartida: dados.tipoPartida, // Deve ser 'manual'
                timerSorteio: null
            };
            console.log(`[Sala ${salaId}] Nova sala criada. Host: ${dados.nome}`);
        }
        
        // Adiciona o jogador à lista
        salas[salaId].jogadores.push({ id: socket.id, nome: dados.nome, status: 'Jogando' });
        
        console.log(`[Sala ${salaId}] ${dados.nome} entrou.`);
        
        // Envia o estado atual do jogo para o novo jogador
        socket.emit('estadoAtual', { 
            numeros: salas[salaId].numeros,
            tipoPartida: salas[salaId].tipoPartida
        });
        
        // Notifica a sala sobre o novo jogador e atualiza o placar
        io.to(salaId).emit('avisoTimer', `${dados.nome} entrou na sala!`);
        atualizarPlacar(salaId);
    });

    // Inicia o Sorteio Cronometrado
    socket.on('iniciarSorteioAutomatico', () => {
        const sala = salas[salaId];
        // Não inicia se não for o host ou se o timer já estiver rodando
        if (!sala || socket.id !== sala.hostId || sala.timerSorteio) return; 
        
        // 1. Inicia o primeiro sorteio imediatamente
        sortearProximoNumero(salaId);

        // 2. Define o timer para os sorteios subsequentes
        sala.timerSorteio = setInterval(() => {
            // Emite um aviso de contagem regressiva para os clientes
            io.to(salaId).emit('avisoTimer', `Próximo número em ${INTERVALO_SORTEIO / 1000} segundos!`);
            
            // Sorteia após um pequeno atraso para o aviso ser lido
            setTimeout(() => {
                sortearProximoNumero(salaId);
            }, 100); 

        }, INTERVALO_SORTEIO);
        
        console.log(`[Sala ${salaId}] Sorteio cronometrado iniciado (${INTERVALO_SORTEIO / 1000}s).`);
        io.to(salaId).emit('avisoTimer', `Sorteio iniciado! Bolinhas a cada ${INTERVALO_SORTEIO / 1000} segundos.`);
    });
    
    // 🚨 CRÍTICO: Lógica para alegar BINGO (recebido do script.js)
    socket.on('alegarVitoria', () => {
        const sala = salas[salaId];
        // Se o timer já estiver parado (jogo acabou), ignora
        if (!sala || !sala.timerSorteio) return; 
        
        const jogador = sala.jogadores.find(j => j.id === socket.id);
        if (jogador) {
            jogador.status = 'VENCEDOR: BINGO! 🏆';
            
            // 1. Para o timer
            if (sala.timerSorteio) {
                clearInterval(sala.timerSorteio);
                sala.timerSorteio = null;
            }
            
            // 2. Notifica todos
            io.to(salaId).emit('fimDeJogo', `${jogador.nome} GANHOU O BINGO! 🥳`);
            
            // 3. Atualiza placar
            atualizarPlacar(salaId);
            console.log(`[Sala ${salaId}] Jogo terminado! Vencedor: ${jogador.nome}`);
        }
    });

    // Lógica de desconexão
    socket.on('disconnect', () => {
        if (!salaId || !salas[salaId]) return;

        console.log(`[Sala ${salaId}] ${usuario.nome} desconectou.`);

        // Remove o jogador da lista
        salas[salaId].jogadores = salas[salaId].jogadores.filter(j => j.id !== socket.id);

        // Limpa o timer se o host sair
        if (salas[salaId].hostId === socket.id) {
             if (salas[salaId].timerSorteio) {
                clearInterval(salas[salaId].timerSorteio);
                salas[salaId].timerSorteio = null;
                console.log(`[Sala ${salaId}] Timer de sorteio parado (Host desconectado).`);
            }
            // Transfere o host para o próximo
            if (salas[salaId].jogadores.length > 0) {
                salas[salaId].hostId = salas[salaId].jogadores[0].id;
                io.to(salas[salaId].hostId).emit('avisoTimer', 'Você é o novo Host. Inicie o sorteio!');
            }
        }
        
        // Se a sala estiver vazia, a remove
        if (salas[salaId].jogadores.length === 0) {
            delete salas[salaId];
            console.log(`[Sala ${salaId}] Sala vazia e removida.`);
            return;
        }
        
        atualizarPlacar(salaId);
    });
}); // <--- CHAVE DE FECHAMENTO FINAL CORRETA AQUI!

// Arquivos estáticos
app.use(express.static('public'));

// 🚨 INICIALIZAÇÃO CORRETA: Usa a porta do ambiente (process.env.PORT) ou 3000 como fallback
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
