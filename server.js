// server.js (Versão Final com Correção de Validação)

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const NUM_MAXIMO_BOLINHAS = 75;
const INTERVALO_SORTEIO = 5000;

const salas = {};

function gerarNovoNumero(numerosSorteados) {
    const todos = Array.from({ length: NUM_MAXIMO_BOLINHAS }, (_, i) => i + 1);
    const naoSorteados = todos.filter(num => !numerosSorteados.includes(num));

    if (naoSorteados.length === 0) {
        return null;
    }

    const indiceAleatorio = Math.floor(Math.random() * naoSorteados.length);
    return naoSorteados[indiceAleatorio];
}

function atualizarPlacar(salaId) {
    const sala = salas[salaId];
    if (!sala) return;
    
    const placarData = sala.jogadores.map(jogador => ({
        nome: jogador.nome,
        status: jogador.status || 'Jogando',
        id: jogador.id
    }));
    
    io.to(salaId).emit('placarAtualizado', placarData);
}

// 🚨 NOVO: Organiza o número sorteado por coluna (B-I-N-G-O)
function getLetra(numero) {
    if (numero >= 1 && numero <= 15) return 'B';
    if (numero >= 16 && numero <= 30) return 'I';
    if (numero >= 31 && numero <= 45) return 'N';
    if (numero >= 46 && numero <= 60) return 'G';
    if (numero >= 61 && numero <= 75) return 'O';
    return '';
}

function sortearProximoNumero(salaId) {
    const sala = salas[salaId];
    if (!sala) return;

    const novoNumero = gerarNovoNumero(sala.numeros);

    if (novoNumero !== null) {
        sala.numeros.push(novoNumero);
        console.log(`[Sala ${salaId}] Novo número sorteado: ${novoNumero}`);
        
        // 🚨 ENVIA O NÚMERO E A LETRA PARA O CLIENTE
        io.to(salaId).emit('novoNumero', {
            numero: novoNumero,
            letra: getLetra(novoNumero), // <--- NOVO
            todos: sala.numeros
        });
        
        atualizarPlacar(salaId);

    } else {
        io.to(salaId).emit('fimDeJogo', 'FIM DE JOGO! Todas as 75 bolinhas foram sorteadas.');
        if (sala.timerSorteio) {
            clearInterval(sala.timerSorteio);
            sala.timerSorteio = null;
        }
    }
}

io.on('connection', (socket) => {
    let salaId;
    let usuario = {};

    socket.on('entrarSala', (dados) => {
        usuario = dados;
        
        if (dados.tipoSala === 'privada' && dados.salaID) {
            salaId = dados.salaID;
        } else {
            salaId = 'SALA_PUBLICA';
        }

        socket.join(salaId);

        if (!salas[salaId]) {
            salas[salaId] = {
                numeros: [],
                jogadores: [],
                hostId: socket.id,
                tipoPartida: dados.tipoPartida,
                timerSorteio: null
            };
            console.log(`[Sala ${salaId}] Nova sala criada. Host: ${dados.nome}`);
        }
        
        salas[salaId].jogadores.push({ id: socket.id, nome: dados.nome, status: 'Jogando' });
        
        console.log(`[Sala ${salaId}] ${dados.nome} entrou.`);
        
        socket.emit('estadoAtual', { 
            numeros: salas[salaId].numeros,
            tipoPartida: salas[salaId].tipoPartida
        });
        
        io.to(salaId).emit('avisoTimer', `${dados.nome} entrou na sala!`);
        atualizarPlacar(salaId);
    });

    socket.on('iniciarSorteioAutomatico', () => {
        const sala = salas[salaId];
        if (!sala || socket.id !== sala.hostId || sala.timerSorteio) return; 
        
        sortearProximoNumero(salaId);

        sala.timerSorteio = setInterval(() => {
            io.to(salaId).emit('avisoTimer', `Próximo número em ${INTERVALO_SORTEIO / 1000} segundos!`);
            
            setTimeout(() => {
                sortearProximoNumero(salaId);
            }, 100); 

        }, INTERVALO_SORTEIO);
        
        console.log(`[Sala ${salaId}] Sorteio cronometrado iniciado (${INTERVALO_SORTEIO / 1000}s).`);
        io.to(salaId).emit('avisoTimer', `Sorteio iniciado! Bolinhas a cada ${INTERVALO_SORTEIO / 1000} segundos.`);
    });
    
    // 🚨 CORREÇÃO DE VALIDAÇÃO: Agora recebe os números marcados do cliente
    socket.on('alegarVitoria', (numerosMarcadosDoCliente) => {
        const sala = salas[salaId];
        
        if (!sala || !sala.timerSorteio) return; 
        
        const numerosSorteados = sala.numeros;

        // VALIDAÇÃO: Verifica se TODOS os números marcados pelo cliente foram sorteados
        const isBingoValido = numerosMarcadosDoCliente.every(num => numerosSorteados.includes(num));

        if (!isBingoValido) {
            socket.emit('avisoTimer', 'ERRO! O Bingo não é válido. Verifique sua cartela e continue jogando.');
            return;
        }
        
        // SE CHEGOU AQUI, O BINGO É VÁLIDO
        const jogador = sala.jogadores.find(j => j.id === socket.id);
        if (jogador) {
            jogador.status = 'VENCEDOR: BINGO! 🏆';
            
            if (sala.timerSorteio) {
                clearInterval(sala.timerSorteio);
                sala.timerSorteio = null;
            }
            
            io.to(salaId).emit('fimDeJogo', `${jogador.nome} GANHOU O BINGO! 🥳`);
            
            atualizarPlacar(salaId);
            console.log(`[Sala ${salaId}] Jogo terminado! Vencedor: ${jogador.nome}`);
        }
    });

    socket.on('disconnect', () => {
        if (!salaId || !salas[salaId]) return;

        console.log(`[Sala ${salaId}] ${usuario.nome} desconectou.`);

        salas[salaId].jogadores = salas[salaId].jogadores.filter(j => j.id !== socket.id);

        if (salas[salaId].hostId === socket.id) {
             if (salas[salaId].timerSorteio) {
                clearInterval(salas[salaId].timerSorteio);
                salas[salaId].timerSorteio = null;
                console.log(`[Sala ${salaId}] Timer de sorteio parado (Host desconectado).`);
            }
            
            if (salas[salaId].jogadores.length > 0) {
                salas[salaId].hostId = salas[salaId].jogadores[0].id;
                io.to(salas[salaId].hostId).emit('avisoTimer', 'Você é o novo Host. Inicie o sorteio!');
            }
        }
        
        if (salas[salaId].jogadores.length === 0) {
            delete salas[salaId];
            console.log(`[Sala ${salaId}] Sala vazia e removida.`);
            return;
        }
        
        atualizarPlacar(salaId);
    });
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
