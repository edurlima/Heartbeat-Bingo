const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

class SorteadorBingo {
    #qtdNumeros; #qtdBolinhasSorteadas; #bolinhasSortadas; #numeros;
    #qtdBolinhasNaoSortadas; #ultimoNumeroSorteado; #todosNumerosSortadas;

    constructor(qtdNumeros) {
        this.#qtdNumeros = qtdNumeros;
        this.#qtdBolinhasSorteadas = 0;
        this.#bolinhasSortadas = [];
        this.#numeros = Array.from({ length: qtdNumeros }, (_, i) => i + 1);
        this.#qtdBolinhasNaoSortadas = qtdNumeros;
        this.#ultimoNumeroSorteado = null;
        this.#todosNumerosSortadas = false;
    }

    get qtdNumeros() { return this.#qtdNumeros; }
    get bolinhasSortadas() { return [...this.#bolinhasSortadas].sort((a, b) => a - b); }
    get ultimoNumeroSorteado() { return this.#ultimoNumeroSorteado; }
    get todosNumerosSortadas() { return this.#todosNumerosSortadas; }

    encontrarLetra(numero) {
        const letrasBingo = {
            'B': [1, 15], 'I': [16, 30], 'N': [31, 45], 'G': [46, 60], 'O': [61, 75]
        };
        for (const letra in letrasBingo) {
            const [min, max] = letrasBingo[letra];
            if (numero >= min && numero <= max) {
                return letra;
            }
        }
        return "ERRO";
    }

    sortearNumero() {
        if (this.#qtdBolinhasNaoSortadas === 0) {
            this.#todosNumerosSortadas = true;
            return null;
        }

        const disponiveis = this.#numeros.filter(num => !this.#bolinhasSortadas.includes(num));
        if (disponiveis.length === 0) {
            this.#todosNumerosSortadas = true;
            return null;
        }

        const indiceSorteado = Math.floor(Math.random() * disponiveis.length);
        const numeroSorteado = disponiveis[indiceSorteado];
        
        this.#bolinhasSortadas.push(numeroSorteado);
        this.#qtdBolinhasSorteadas = this.#bolinhasSortadas.length;
        this.#qtdBolinhasNaoSortadas = this.#qtdNumeros - this.#qtdBolinhasSorteadas;
        this.#ultimoNumeroSorteado = numeroSorteado;

        return {
            numero: numeroSorteado,
            letra: this.encontrarLetra(numeroSorteado),
            todos: this.bolinhasSortadas
        };
    }

    reiniciar() {
        this.#qtdBolinhasSorteadas = 0;
        this.#bolinhasSortadas = [];
        this.#qtdBolinhasNaoSortadas = this.#qtdNumeros;
        this.#ultimoNumeroSorteado = null;
        this.#todosNumerosSortadas = false;
    }
    
    verificarNumerosVencedores(numerosAlegados) {
        if (!numerosAlegados || numerosAlegados.length === 0) {
            return false;
        }
        
        const sorteadosSet = new Set(this.bolinhasSortadas);
        for (const num of numerosAlegados) {
            if (!sorteadosSet.has(num)) {
                return false;
            }
        }
        return true;
    }
}

const salas = {};

function criarSala(salaID) {
    if (!salas[salaID]) {
        salas[salaID] = {
            bingo: new SorteadorBingo(75),
            jogadores: [],
            intervaloDeSorteio: null,
            sorteioEmAndamento: false,
            sorteioPausado: false,
            vencedores: new Set(),
            contadorBingo: 0
        };
    }
    return salas[salaID];
}

function montarPlacar(sala) {
    return sala.jogadores.map(jogador => ({
        nome: jogador.nome,
        status: jogador.vencedor ? 'BINGO! VENCEDOR' : 'Em Jogo'
    }));
}

function sortearProximoNumero(io, salaID) {
    const sala = salas[salaID];
    if (!sala || sala.bingo.todosNumerosSortadas || sala.sorteioPausado) {
        return;
    }

    const resultado = sala.bingo.sortearNumero();

    if (resultado) {
        io.to(salaID).emit('novoNumero', resultado);
    } else {
        clearInterval(sala.intervaloDeSorteio);
        sala.intervaloDeSorteio = null;
        sala.sorteioEmAndamento = false;
        io.to(salaID).emit('fimDeJogo', "FIM DE JOGO! Todos os números foram sorteados.");
    }
}

function iniciarSorteioAutomatico(io, salaID) {
    const sala = salas[salaID];
    if (!sala || sala.sorteioEmAndamento || sala.sorteioPausado) return;

    sala.sorteioEmAndamento = true;
    sala.sorteioPausado = false;

    sortearProximoNumero(io, salaID); 

    sala.intervaloDeSorteio = setInterval(() => {
        sortearProximoNumero(io, salaID);
    }, 5000);

    io.to(salaID).emit('avisoTimer', "Sorteio automático iniciado. Novo número a cada 5 segundos.");
}

function pausarSorteio(io, salaID) {
    const sala = salas[salaID];
    if (!sala || !sala.sorteioEmAndamento || sala.sorteioPausado) return;

    sala.sorteioPausado = true;
    io.to(salaID).emit('sorteioPausado');
}

function retomarSorteio(io, salaID) {
    const sala = salas[salaID];
    if (!sala || !sala.sorteioEmAndamento || !sala.sorteioPausado) return;

    sala.sorteioPausado = false;
    io.to(salaID).emit('sorteioRetomado');
}

function removerJogador(socket, salaID) {
    if (salas[salaID]) {
        const sala = salas[salaID];
        sala.jogadores = sala.jogadores.filter(p => p.id !== socket.id);
        
        io.to(salaID).emit('placarAtualizado', montarPlacar(sala));
        
        if (sala.jogadores.length === 0) {
            clearInterval(sala.intervaloDeSorteio);
            delete salas[salaID];
            console.log(`Sala ${salaID} fechada.`);
        }
    }
}

io.on('connection', (socket) => {
    let salaID = null;

    socket.on('entrarSala', (dados) => {
        const nome = dados.nome;
        let tipoSala = dados.tipoSala;
        let idSolicitado = dados.salaID;

        if (tipoSala === 'publica') {
            const salasPublicas = Object.keys(salas).filter(id => id.startsWith('PUBLIC_') && salas[id].jogadores.length < 10);
            if (salasPublicas.length > 0) {
                salaID = salasPublicas[0];
            } else {
                salaID = `PUBLIC_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
                criarSala(salaID);
            }
        } else {
            salaID = idSolicitado || `PRIVATE_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
            if (!salas[salaID]) {
                criarSala(salaID);
            }
        }

        const sala = salas[salaID];
        socket.join(salaID);

        const jogador = { id: socket.id, nome: nome, vencedor: false };
        sala.jogadores.push(jogador);

        io.to(salaID).emit('placarAtualizado', montarPlacar(sala));

        socket.emit('estadoAtual', {
            numeros: sala.bingo.bolinhasSortadas,
            sorteioPausado: sala.sorteioPausado
        });
    });

    socket.on('iniciarSorteioAutomatico', () => {
        if (salaID) {
            iniciarSorteioAutomatico(io, salaID);
        }
    });

    socket.on('pausarSorteio', () => {
        if (salaID) {
            pausarSorteio(io, salaID);
        }
    });

    socket.on('retomarSorteio', () => {
        if (salaID) {
            retomarSorteio(io, salaID);
        }
    });
    
    socket.on('alegarVitoria', (numerosAlegados) => {
        if (!salaID) return;

        const sala = salas[salaID];
        if (!sala) return;

        const jogadorIndex = sala.jogadores.findIndex(p => p.id === socket.id);
        if (jogadorIndex === -1 || sala.jogadores[jogadorIndex].vencedor) return;

        const isValid = sala.bingo.verificarNumerosVencedores(numerosAlegados);

        if (isValid) {
            sala.jogadores[jogadorIndex].vencedor = true;
            sala.vencedores.add(socket.id);
            sala.contadorBingo++;
            
            io.to(salaID).emit('placarAtualizado', montarPlacar(sala));
            io.to(salaID).emit('avisoTimer', `BINGO VALIDADO! ${sala.jogadores[jogadorIndex].nome} é o vencedor #${sala.contadorBingo}!`);
            
        } else {
            io.to(socket.id).emit('avisoTimer', 'ERRO! BINGO INVÁLIDO. Números alegados não foram sorteados.');
        }
    });

    socket.on('disconnect', () => {
        if (salaID) {
            removerJogador(socket, salaID);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
