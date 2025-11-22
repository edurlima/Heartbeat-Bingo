// ===============================================
// SETUP INICIAL E CONEXÃO
// ===============================================

const socket = io(); // Assume que o Socket.IO está carregado no HTML
let usuarioInfo = {};
let salaID = '';
let cartelaGerada = false;

// Elementos DOM para atualização
const STATUS_AVISO = document.getElementById('aviso-status');
const DISPLAY_ULTIMO_SORTEADO = document.getElementById('ultimo-sorteado');
const CONTAINER_PLACARES = document.getElementById('placar-sorteio');
const BOTAO_BINGO = document.getElementById('botao-bingo'); // Certifique-se que o ID está correto

// Armazena os números sorteados organizados por letra
const COLUNAS_SORTEIO = { 'B': [], 'I': [], 'N': [], 'G': [], 'O': [] };


// ===============================================
// FUNÇÕES DE UTILIDADE E GERAÇÃO DE CARTELA
// ===============================================

function gerarCartelaBingo() {
    // ⚠️ ATENÇÃO: Esta função deve ser implementada para gerar sua cartela HTML/Dados
    // Por simplicidade, vou apenas simular a geração aqui.

    // A função deve:
    // 1. Gerar 24 números únicos de 1 a 75, organizados nas colunas B-I-N-G-O.
    // 2. Renderizar a tabela HTML da cartela.
    // 3. Adicionar event listeners para marcar/desmarcar células.
    // 4. Se a cartela for gerada com sucesso:
    cartelaGerada = true;
    console.log("Cartela gerada e pronta para o jogo!");
}

// 🚨 FUNÇÃO CRÍTICA PARA VALIDAÇÃO: Obtém os números marcados na tela
function obterNumerosMarcadosNaTela() {
    const numerosMarcados = [];
    
    // Altere este seletor para o que corresponde às células marcadas na sua cartela.
    // Exemplo: se suas células marcadas têm a classe 'marcado'
    document.querySelectorAll('.celula-cartela.marcado').forEach(cell => {
        // Assume que o número está armazenado em um atributo 'data-numero'
        const num = parseInt(cell.getAttribute('data-numero')); 
        if (!isNaN(num)) {
            numerosMarcados.push(num);
        }
    });
    
    // O número 0 (célula central "FREE") deve ser ignorado na validação,
    // a menos que você o trate de forma especial no servidor.
    return numerosMarcados;
}


// ===============================================
// LÓGICA DE PLACAR VISUAL (B-I-N-G-O)
// ===============================================

function renderizarPlacarSorteio(colunas) {
    // 1. Limpa o container
    CONTAINER_PLACARES.innerHTML = ''; 

    // 2. Cria o container do placar
    const placarHTML = document.createElement('div');
    placarHTML.className = 'placar-bingo-container'; 
    
    for (const letra in colunas) {
        const colunaDiv = document.createElement('div');
        colunaDiv.className = 'placar-coluna';
        
        const titulo = document.createElement('h3');
        titulo.textContent = letra;
        colunaDiv.appendChild(titulo);

        // Lista os números ordenados
        colunas[letra].slice().sort((a, b) => a - b).forEach(num => {
            const numSpan = document.createElement('span');
            numSpan.textContent = num;
            colunaDiv.appendChild(numSpan);
        });

        placarHTML.appendChild(colunaDiv);
    }
    
    CONTAINER_PLACARES.appendChild(placarHTML);
}


// ===============================================
// LÓGICA DO JOGO (SOCKET EVENTS)
// ===============================================

// Envia as informações para o servidor e tenta entrar na sala
function entrarNoJogo(nome, tipoSala, salaIDDesejada, tipoPartida) {
    if (!cartelaGerada) {
        // Exiba um erro ou gere a cartela antes de entrar
        // gerarCartelaBingo(); 
    }
    
    usuarioInfo = { nome, tipoSala, salaID: salaIDDesejada, tipoPartida };
    socket.emit('entrarSala', usuarioInfo);
}


// Recebe um novo número sorteado do servidor
socket.on('novoNumero', (data) => {
    // data agora inclui: data.numero, data.letra, data.todos
    
    // 1. Atualiza o último número sorteado
    DISPLAY_ULTIMO_SORTEADO.textContent = `${data.letra}${data.numero}`;
    
    // 2. Adiciona o número na coluna correta para visualização
    COLUNAS_SORTEIO[data.letra].push(data.numero);
    
    // 3. Renderiza o Placar na Tela
    renderizarPlacarSorteio(COLUNAS_SORTEIO);

    // 4. Lógica para marcar o número na cartela do jogador (implementação sua)
    // marcarNumeroNaCartela(data.numero);
});


// Recebe avisos do servidor (erros de validação, contagem regressiva, etc.)
socket.on('avisoTimer', (mensagem) => {
    STATUS_AVISO.textContent = mensagem;
    // Ex: Se receber um ERRO de validação de BINGO, o botão é reativado
    BOTAO_BINGO.disabled = false;
});

// Recebe o estado inicial da sala ao entrar
socket.on('estadoAtual', (data) => {
    // Inicializa o placar se já houver números sorteados
    if (data.numeros.length > 0) {
        data.numeros.forEach(num => {
            const letra = getLetra(num); // Use a função getLetra se a tiver no cliente, ou confie no server
            COLUNAS_SORTEIO[letra].push(num);
        });
        renderizarPlacarSorteio(COLUNAS_SORTEIO);
    }
});

// Recebe a lista atualizada de jogadores
socket.on('placarAtualizado', (jogadores) => {
    // ⚠️ ATENÇÃO: Implemente aqui a lógica para atualizar sua tabela/lista de jogadores
    console.log("Placar atualizado:", jogadores);
});

// Recebe notificação de fim de jogo
socket.on('fimDeJogo', (mensagem) => {
    STATUS_AVISO.textContent = mensagem;
    BOTAO_BINGO.disabled = true; // Desabilita o botão após a vitória/fim
    // Lógica para exibir modal de vitória/derrota
});


// ===============================================
// LÓGICA DE BOTÃO (BINGO)
// ===============================================

// 🚨 NOVO: Função que deve ser chamada quando o jogador clica no BINGO
function alegarVitoriaBingo() {
    // 1. Obtém todos os números da cartela que o jogador MARCOU como certos
    const numerosMarcados = obterNumerosMarcadosNaTela(); 
    
    if (numerosMarcados.length < 5) {
        alert("Você precisa ter pelo menos 5 números marcados para um BINGO!");
        return;
    }
    
    // 2. Envia o array de números marcados para o servidor
    socket.emit('alegarVitoria', numerosMarcados);
    
    // 3. Desabilita o botão para evitar spam enquanto aguarda a resposta do servidor
    BOTAO_BINGO.disabled = true;
}

// ⚠️ ADICIONE O EVENT LISTENER APÓS O CARREGAMENTO DA PÁGINA
if(BOTAO_BINGO) {
    BOTAO_BINGO.addEventListener('click', alegarVitoriaBingo);
}


// ------------------------------------------------------------------
// (OPCIONAL) Se quiser a função getLetra no cliente para uso interno:
function getLetra(numero) {
    if (numero >= 1 && numero <= 15) return 'B';
    if (numero >= 16 && numero <= 30) return 'I';
    if (numero >= 31 && numero <= 45) return 'N';
    if (numero >= 46 && numero <= 60) return 'G';
    if (numero >= 61 && numero <= 75) return 'O';
    return '';
}
// ------------------------------------------------------------------
