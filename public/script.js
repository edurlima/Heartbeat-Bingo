// ==============================================================================
// INÍCIO: CONEXÃO MULTIPLAYER
// ==============================================================================
const socket = io(); 


// ==============================================================================
// 1. CLASSES E LÓGICA BASE
// ==============================================================================

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
    get qtdBolinhasSorteadas() { return this.#qtdBolinhasSorteadas; }
    
    set bolinhasSortadas(novasBolinhas) { 
        this.#bolinhasSortadas = novasBolinhas;
        this.#qtdBolinhasSorteadas = novasBolinhas.length;
        this.#qtdBolinhasNaoSortadas = this.#qtdNumeros - novasBolinhas.length;

        if (novasBolinhas && novasBolinhas.length > 0) {
            this.#ultimoNumeroSorteado = novasBolinhas[novasBolinhas.length - 1]; 
        } else {
            this.#ultimoNumeroSorteado = null;
        }
        
        if (this.#qtdBolinhasNaoSortadas === 0) {
             this.#todosNumerosSortadas = true;
        }
    }
    
    get bolinhasSortadas() { return [...this.#bolinhasSortadas].sort((a, b) => a - b); } 
    get ultimoNumeroSorteado() { return this.#ultimoNumeroSorteado; }
    get todosNumerosSortadas() { return this.#todosNumerosSortadas; }
    
    sortearNumero() {
        if (this.#qtdBolinhasNaoSortadas === 0) {
            this.#todosNumerosSortadas = true;
            return false;
        }
        return true;
    }
}

class SorteadorBingoBrasileiro extends SorteadorBingo {
    #letra; #formasVitoria; #tipoVitoria;

    constructor() {
        super(75);
        this.#letra = null;
        this.#formasVitoria = ["Quina e Bingo", "Bingo"];
        this.#tipoVitoria = 0;
        
        this._letrasBingo = {
            'B': [1, 15], 'I': [16, 30], 'N': [31, 45], 'G': [46, 60], 'O': [61, 75]
        };
    }

    get letra() { return this.#letra; }
    get tipoVitoria() { return this.#formasVitoria[this.#tipoVitoria]; }
    get tipoVitoriaIndice() { return this.#tipoVitoria; }
    
    set tipoVitoria(novoTipo) { 
        if (novoTipo >= 0 && novoTipo < this.#formasVitoria.length) {
            this.#tipoVitoria = novoTipo; 
        }
    }

    encontrarLetra(numero) {
        for (const letra in this._letrasBingo) {
            const [min, max] = this._letrasBingo[letra];
            if (numero >= min && numero <= max) {
                return letra;
            }
        }
        return "ERRO";
    }

    static gerarCartela(idCartela) {
        const cartela = {};
        const rangeMap = {
            'B': [1, 15], 'I': [16, 30], 'N': [31, 45], 'G': [46, 60], 'O': [61, 75]
        };

        for (const letra in rangeMap) {
            const [min, max] = rangeMap[letra]; // Correção: Desestruturação correta
            const numeros = [];
            while (numeros.length < 5) {
                const num = Math.floor(Math.random() * (max - min + 1)) + min;
                if (!numeros.includes(num)) {
                    numeros.push(num);
                }
            }
            cartela[letra] = numeros.sort((a, b) => a - b);
        }
        cartela['N'][2] = 'FREE'; // Mantém 'FREE' na data, mas renderiza como coração
        
        return cartela;
    }
    
    static montarCartelaHTML(cartelaData, id) { 
        const letras = ['B', 'I', 'N', 'G', 'O'];
        
        let html = `<table class="cartela-exemplo" id="${id}" data-cartela-data='${JSON.stringify(cartelaData)}'>`; 
        
        html += '<thead><tr>';
        letras.forEach(letra => { html += `<th>${letra}</th>`; });
        html += '</tr></thead>';
        
        html += '<tbody>';
        for (let i = 0; i < 5; i++) {
            html += '<tr>';
            letras.forEach(letra => {
                const valor = cartelaData[letra][i];
                const isFree = valor === 'FREE';
                const idCelula = `${id}-${letra}-${i}`;
                
                // Se for FREE, já começa marcada e exibe o coração
                const classeInicial = isFree ? 'marcado' : 'nao-marcado'; 
                const displayValue = isFree ? '💖' : valor; // Mostra coração ou número
                
                const eventListener = `onclick="toggleMarcacao(this)"`; 

                html += `<td id="${idCelula}" class="cartela-celula ${classeInicial}" data-numero="${valor}" ${eventListener}>${displayValue}</td>`;
            });
            html += '</tr>';
        }
        html += '</tbody></table>';
        return html;
    }

    static verificarVitoria(bingoInstance, cartela, numerosSorteados) {
        const letras = ['B', 'I', 'N', 'G', 'O'];
        const ID_BASE = 'cartela-exemplo-id'; // Assume a primeira cartela

        const isMarcado = (val, cellId) => {
            if (val === 'FREE') return true; 
            const cell = document.getElementById(cellId);
            return cell && cell.classList.contains('marcado');
        };

        let quinaEncontrada = false;
        let totalMarcado = 0;
        
        // Verifica Linhas e Colunas
        for (let i = 0; i < 5; i++) {
            let acertosLinha = 0;
            let acertosColuna = 0;
            
            for (let j = 0; j < 5; j++) {
                const linhaCellId = `${ID_BASE}-${letras[j]}-${i}`;
                const colunaCellId = `${ID_BASE}-${letras[i]}-${j}`;
                
                // Verifica linha
                const valLinha = cartela[letras[j]][i];
                if (isMarcado(valLinha, linhaCellId)) { acertosLinha++; }

                // Verifica coluna
                const valColuna = cartela[letras[i]][j];
                if (isMarcado(valColuna, colunaCellId)) { acertosColuna++; }
            }
            if (acertosLinha === 5 || acertosColuna === 5) { quinaEncontrada = true; }
        }
        
        // Conta total marcado para o Bingo
        for (let i = 0; i < 5; i++) {
            for (let j = 0; j < 5; j++) {
                const val = cartela[letras[j]][i];
                const cellId = `${ID_BASE}-${letras[j]}-${i}`;
                if (isMarcado(val, cellId)) {
                    totalMarcado++;
                }
            }
        }

        // Verifica Diagonais
        let acertosDiagPrincipal = 0;
        let acertosDiagSecundaria = 0;
        for (let i = 0; i < 5; i++) {
            const diagPId = `${ID_BASE}-${letras[i]}-${i}`;
            const diagSId = `${ID_BASE}-${letras[4 - i]}-${i}`;

            if (isMarcado(cartela[letras[i]][i], diagPId)) { acertosDiagPrincipal++; }
            if (isMarcado(cartela[letras[4 - i]][i], diagSId)) { acertosDiagSecundaria++; }
        }
        if (acertosDiagPrincipal === 5 || acertosDiagSecundaria === 5) { quinaEncontrada = true; }

        // Lógica de vitória: Quina e Bingo (25 marcações)
        if (bingoInstance.tipoVitoriaIndice === 0) { 
            if (totalMarcado >= 25) { // 24 marcadas + 1 FREE = 25
                return { tipo: "Bingo", detalhe: "Cartela Completa" };
            }
            if (quinaEncontrada) {
                return { tipo: "Quina", detalhe: "Linha/Coluna/Diagonal" };
            }
        }
        
        return { tipo: "Nenhum", detalhe: "" };
    }
}


// ==============================================================================
// 2. VARIÁVEIS DE CONTROLE GLOBAL
// ==============================================================================
let idiomaAtual = 'pt-br'; 
let cartelaCounter = 1; 
let modoDePartida = 'manual'; // ⚠️ AGORA É SEMPRE MANUAL

const bingo = new SorteadorBingoBrasileiro();
const ID_PRIMEIRA_CARTELA = "cartela-exemplo-id"; 
const BINGO_CARTELA_DATA = SorteadorBingoBrasileiro.gerarCartela(null); 
const CARTELA_EXEMPLO = SorteadorBingoBrasileiro.montarCartelaHTML(BINGO_CARTELA_DATA, ID_PRIMEIRA_CARTELA); 

// Variáveis para elementos do DOM
let btnIniciarSorteioTimer = null; 
let btnReiniciar = null; 
let btnAddCartela = null; 
let numeroSorteadoDisplay = null;
let cartelasAgrupadasDiv = null;
let tipoVitoriaAtualSpan = null;
let notificacaoToast = null;
let notificacaoMensagem = null;
let placarMultiplayerDiv = null; 


// ==============================================================================
// 3. OBJETO DE TRADUÇÃO E FUNÇÕES DE UTILIDADE
// ==============================================================================

const TRADUCOES = {
    'pt-br': {
        SAUDACAO: 'Bem-vindo! Heartbeat Bingo iniciado.',
        CHAMANDO: (letra, numero) => `Chamando: [${letra}] - ${numero}! Marque sua cartela!`,
        QUINA_MSG: '✨ QUINA! QUASE LÁ!',
        BINGO_MSG: 'BINGO!!! 🎉🎉🎉 VENCEDOR!',
        FIM_JOGO: 'FIM DE JOGO! Não há mais números para sortear.',
        PLACEHOLDER_INICIAL: 'Aguardando início do sorteio...',
        BOTOES: { SORTEAR: 'Iniciar Sorteio Cronometrado', REINICIAR: 'Reiniciar/Sair', TITULO_B: 'Heartbeat Bingo!' }
    },
};

function mostrarNotificacao(mensagem, tipo) {
    if (notificacaoToast && notificacaoMensagem) {
        notificacaoMensagem.textContent = mensagem;
        notificacaoToast.classList.remove('show', 'quina', 'bingo', 'alerta');

        if (tipo) {
            notificacaoToast.classList.add(tipo);
        } else {
            notificacaoToast.classList.add('alerta'); 
        }

        setTimeout(() => {
            notificacaoToast.classList.add('show');
        }, 10); 

        setTimeout(() => {
            notificacaoToast.classList.remove('show');
        }, 3000); 
    }
}

// --- Função para Marcar/Desmarcar Célula (Modo Manual) ---
window.toggleMarcacao = function(cellElement) {
    // A célula FREE não deve ser desmarcada.
    if (cellElement.dataset.numero === 'FREE') return;

    if (modoDePartida === 'manual') {
        cellElement.classList.toggle('marcado');
        
        const cartelaElemento = cellElement.closest('.cartela-exemplo');
        if (cartelaElemento) {
            setTimeout(() => {
                 marcarECarregarCartela(cartelaElemento);
            }, 50);
        }
    }
}

// --- Função para Renderizar o Visor de Números Chamados ---
function renderVisorChamados() {
    const chamadosDiv = document.getElementById('visorNumerosChamados'); 
    const countSpan = document.getElementById('countChamados');
    if (!chamadosDiv) return;

    const numeros = bingo.bolinhasSortadas;
    countSpan.textContent = numeros.length;

    let html = '';
    numeros.forEach(num => {
        const letra = bingo.encontrarLetra(num);
        html += `<div class="bolinha-chamada" title="${letra}-${num}"><span class="bolinha-letra">${letra}</span> ${num}</div>`;
    });

    chamadosDiv.innerHTML = html;
}


// ==============================================================================
// 4. FUNÇÕES DE RENDERIZAÇÃO E MARCAÇÃO
// ==============================================================================

function marcarECarregarCartela(cartelaElemento) {
    cartelaElemento.classList.remove('efeito-quina', 'efeito-bingo');

    if (cartelaElemento.id === ID_PRIMEIRA_CARTELA) {
        const cartelaDataStr = cartelaElemento.getAttribute('data-cartela-data');
        if (!cartelaDataStr) return;
        const cartelaData = JSON.parse(cartelaDataStr);
        
        const resultadoVitoria = SorteadorBingoBrasileiro.verificarVitoria(bingo, cartelaData, bingo.bolinhasSortadas);
        
        let mostrarQuina = false;

        if (resultadoVitoria.tipo === "Quina") {
            cartelaElemento.classList.add('efeito-quina');
            mostrarQuina = true;
            
        } else if (resultadoVitoria.tipo === "Bingo") {
            cartelaElemento.classList.add('efeito-bingo');
            
            // 🚨 CRÍTICO BINGO: Notificação local + emissão do BINGO para o servidor
            mostrarNotificacao(TRADUCOES[idiomaAtual].BINGO_MSG, 'bingo'); 
            socket.emit('alegarVitoria');
            
            // Desabilita o botão localmente
            if (btnIniciarSorteioTimer) {
                btnIniciarSorteioTimer.disabled = true; 
            }
        }
        
        // 🚨 NOVO: Lógica para notificação de Quina (mostra apenas a primeira vez)
        if (mostrarQuina) {
            // Usa dataset para evitar spam da notificação
            if (!cartelaElemento.dataset.quinaNotificada) {
                 mostrarNotificacao(TRADUCOES[idiomaAtual].QUINA_MSG, 'quina');
                 cartelaElemento.dataset.quinaNotificada = 'true'; // Marca que já foi notificada
            }
        } else {
             // Se não for mais Quina, reseta o marcador
             cartelaElemento.dataset.quinaNotificada = ''; 
        }
    }
}

function renderizarTodasCartelas() {
    const todasCartelas = document.querySelectorAll('.cartela-exemplo');
    if (todasCartelas.length === 0) return;

    todasCartelas.forEach(cartelaElemento => {
        marcarECarregarCartela(cartelaElemento);
    });
}

function renderHeader() {
    const titulo = document.getElementById('titulo-jogo');
    if (titulo) {
        titulo.textContent = `💖 ${TRADUCOES[idiomaAtual].BOTOES.TITULO_B} 💖`;
    }
}

function renderPlacar() {
    const ultimoNum = bingo.ultimoNumeroSorteado;
    const letra = ultimoNum ? bingo.encontrarLetra(ultimoNum) : null;
    
    if (numeroSorteadoDisplay) {
        if (ultimoNum) {
            numeroSorteadoDisplay.innerHTML = `<span style="animation: pulse 1s infinite;">${letra}-${ultimoNum}</span>`; 
        } else {
            numeroSorteadoDisplay.textContent = TRADUCOES[idiomaAtual].PLACEHOLDER_INICIAL;
        }
    } else {
        console.error("ERRO: Elemento .numero-sorteado não encontrado no DOM!");
    }
    
    if (bingo.todosNumerosSortadas && btnIniciarSorteioTimer) {
        btnIniciarSorteioTimer.disabled = true;
    }
    
    renderVisorChamados(); 
}

function renderPlacarMultiplayer(placarData) {
    if (!placarMultiplayerDiv) return;

    let html = '<table>';
    html += '<thead><tr><th>Nome</th><th>Status</th></tr></thead>';
    html += '<tbody>';

    placarData.forEach(jogador => {
        const isVencedor = jogador.status.toUpperCase().includes('VENCEDOR');
        const rowClass = isVencedor ? 'vencedor-linha' : '';
        const statusClass = isVencedor ? 'vencedor' : ''; 
        
        html += `<tr class="${rowClass}"> 
                    <td><strong>${jogador.nome}</strong></td>
                    <td class="${statusClass}">${jogador.status}</td>
                 </tr>`;
    });

    html += '</tbody></table>';
    placarMultiplayerDiv.innerHTML = html;
}

function adicionarNovaCartela() {
    cartelaCounter++;
    const novoID = `cartela-${cartelaCounter}-id`;
    
    const novaCartelaData = SorteadorBingoBrasileiro.gerarCartela(null);
    const novaCartelaHTML = SorteadorBingoBrasileiro.montarCartelaHTML(novaCartelaData, novoID); 
    
    if (cartelasAgrupadasDiv) {
        cartelasAgrupadasDiv.insertAdjacentHTML('beforeend', novaCartelaHTML);
        
        const novaCartelaElemento = document.getElementById(novoID);
        if (novaCartelaElemento) {
            marcarECarregarCartela(novaCartelaElemento);
        }
    }
}


// ==============================================================================
// 5. INICIALIZAÇÃO E CONEXÃO DOS BOTÕES
// ==============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. REFERÊNCIAS DOM
    btnIniciarSorteioTimer = document.getElementById('btnIniciarSorteioTimer');
    btnReiniciar = document.getElementById('btnReiniciar'); 
    btnAddCartela = document.getElementById('btnAddCartela'); 
    numeroSorteadoDisplay = document.querySelector('.numero-sorteado');
    cartelasAgrupadasDiv = document.querySelector('.cartelas-agrupadas');
    tipoVitoriaAtualSpan = document.getElementById('tipo-vitoria-atual');
    notificacaoToast = document.getElementById('notificacao-vitoria'); 
    notificacaoMensagem = document.getElementById('notificacao-mensagem'); 
    placarMultiplayerDiv = document.getElementById('placar-multiplayer'); 
    
    const menuInicialDiv = document.getElementById('menuInicial');
    const jogoPrincipalDiv = document.getElementById('jogoPrincipal');
    const formInicio = document.getElementById('formInicio');
    const inputNome = document.getElementById('inputNome');
    const inputSalaID = document.getElementById('inputSalaID');
    const salaPrivadaRadio = document.getElementById('salaPrivada');
    const salaIDGroup = document.getElementById('salaIDGroup');

    // Lógica para mostrar/esconder o campo de ID da sala
    document.querySelectorAll('input[name="tipoSala"]').forEach(radio => {
        radio.addEventListener('change', () => {
            salaIDGroup.style.display = salaPrivadaRadio.checked ? 'block' : 'none';
        });
    });

    // 2. ADICIONAR CARTELA INICIAL
    if (cartelasAgrupadasDiv) {
        cartelasAgrupadasDiv.innerHTML = CARTELA_EXEMPLO; 
    }
    
    // =======================================================
    // LÓGICA DE INÍCIO DE JOGO
    // =======================================================
    if (formInicio) {
        formInicio.addEventListener('submit', (event) => {
            event.preventDefault(); 

            const nomeUsuario = inputNome.value.trim();
            const tipoSala = document.querySelector('input[name="tipoSala"]:checked').value;
            let salaID = tipoSala === 'privada' ? inputSalaID.value.trim().toUpperCase() : '';
            
            if (!nomeUsuario) {
                mostrarNotificacao("Por favor, digite seu nome para começar!", 'alerta');
                return;
            }

            // 1. Oculta o menu e mostra o jogo
            menuInicialDiv.style.display = 'none';
            jogoPrincipalDiv.style.display = 'flex'; 
            
            // 2. EMITE O EVENTO DE ENTRAR NA SALA
            socket.emit('entrarSala', { 
                nome: nomeUsuario, 
                salaID: salaID, 
                tipoSala: tipoSala,
                tipoPartida: modoDePartida // Sempre 'manual'
            });

            // 3. Inicializa os renderizadores
            renderHeader(); 
            if (tipoVitoriaAtualSpan) {
                tipoVitoriaAtualSpan.textContent = bingo.tipoVitoria;
            }
        });
    }
    
    // ===========================================
    // LISTENERS DO SOCKET.IO (CLIENTE)
    // ===========================================
    
    socket.on('estadoAtual', (estado) => {
        bingo.bolinhasSortadas = estado.numeros;
        
        // Recria a cartela inicial para garantir que o onclick está ativo
        cartelasAgrupadasDiv.innerHTML = SorteadorBingoBrasileiro.montarCartelaHTML(BINGO_CARTELA_DATA, ID_PRIMEIRA_CARTELA); 
        
        renderPlacar();
        renderizarTodasCartelas(); 
        renderHeader();
        renderVisorChamados(); 
    });

    socket.on('novoNumero', (dados) => {
        bingo.bolinhasSortadas = dados.todos; 
        mostrarNotificacao(TRADUCOES[idiomaAtual].CHAMANDO(bingo.encontrarLetra(dados.numero), dados.numero), 'alerta');
        
        renderPlacar(); 
        renderizarTodasCartelas();
        renderVisorChamados(); 
    });
    
    // 🚨 CRÍTICO: Recebe a notificação de BINGO do servidor e desabilita o sorteio
    socket.on('fimDeJogo', (mensagem) => {
        mostrarNotificacao(mensagem, 'bingo'); // Usa 'bingo' para destaque
        if (btnIniciarSorteioTimer) {
            btnIniciarSorteioTimer.disabled = true;
        }
    });

    socket.on('placarAtualizado', (placar) => {
        renderPlacarMultiplayer(placar);
    });
    
    socket.on('avisoTimer', (mensagem) => {
        mostrarNotificacao(mensagem, 'quina');
    });

    
    // ===========================================
    // LISTENERS DE INTERFACE
    // ===========================================

    if (btnIniciarSorteioTimer) {
        btnIniciarSorteioTimer.addEventListener('click', () => {
            socket.emit('iniciarSorteioAutomatico'); 
            btnIniciarSorteioTimer.disabled = true; 
            mostrarNotificacao("⏳ Sorteio de 8s iniciado! Marque sua cartela.", 'quina');
        });
    }

    if (btnReiniciar) {
        btnReiniciar.addEventListener('click', () => {
            if (confirm(TRADUCOES[idiomaAtual].BOTOES.REINICIAR + ' e sair da sala?')) {
                location.reload(); 
            }
        });
    }

    if (btnAddCartela) {
        btnAddCartela.addEventListener('click', adicionarNovaCartela);
    }
    
    // Inicialização final
    if (tipoVitoriaAtualSpan) {
         tipoVitoriaAtualSpan.textContent = bingo.tipoVitoria;
    }
});