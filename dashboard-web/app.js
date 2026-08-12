const formatMoney = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const formatNum = (val) => new Intl.NumberFormat('pt-BR').format(val);
const formatPct = (val) => val.toFixed(1) + '%';
const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
let globalData = null;
let charts = {};

// DOM Elements
const uploadScreen = document.getElementById('view-integracoes');
const dashboardScreen = document.getElementById('view-visao-geral');
const fileInput = document.getElementById('excelFile');
const loading = document.getElementById('loading');
const btnExportPDF = document.getElementById('btnExportPDF');

// API Constants
const API_BASE = AWS_CONFIG.apiUrl;

// Initialize data on load
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuthAndRedirect()) {
        login(); // Force AWS login instantly
        return;
    }
    
    // Token exists, parse it to show user role
    const token = getToken();
    let role = "Modo Visitante (Teste)";
    let badgeColor = "#64748b"; // Cinza
    
    try {
        const payloadB64 = token.split('.')[1];
        const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadJson);
        const groups = payload['cognito:groups'] || [];
        
        if (groups.includes('Araujo-Admins')) {
            role = "Administrador (Araujo)";
            badgeColor = "#10b981"; // Verde sucesso
        }
    } catch(e) { console.error("Erro ao ler token", e); }
    
    const badge = document.getElementById('userRoleBadge');
    if(badge) {
        badge.innerText = role;
        badge.style.background = badgeColor;
    }

    fetchDashboardData();
})
let dashboardDataCache = null;
let receitasDataCache = null;
let rhDataCache = null;
let perdasDataCache = null;

// Tab Navigation Logic
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        if(e.target.classList.contains('btn-logout')) return;
        
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        const target = e.currentTarget.getAttribute('data-target');
        document.querySelectorAll('.view-container').forEach(v => v.classList.add('hidden'));
        document.getElementById(target).classList.remove('hidden');
        
        document.getElementById('pageTitle').innerText = e.currentTarget.innerText.trim();
        
        // Lazy load data for tabs
        if(target === 'view-receitas' && !receitasDataCache) fetchReceitasData();
        if(target === 'view-rh' && !rhDataCache) fetchRhData();
        if(target === 'view-perdas' && !perdasDataCache) fetchPerdasData();
        if(target === 'view-custos') updateCustosView();
    });
});

// ---- LocalStorage Cache Helpers ----
const CACHE_KEY_DASHBOARD = 'apex_dashboard_data';
const CACHE_KEY_RECEITAS  = 'apex_receitas_data';
const CACHE_KEY_RH        = 'apex_rh_data';

function saveToCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
}
function loadFromCache(key) {
    try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : null; } catch(e) { return null; }
}

// Fetch Data from Backend
async function fetchDashboardData() {
    // 1. Carrega cache do localStorage IMEDIATAMENTE (evita tela vazia no F5)
    const cached = loadFromCache(CACHE_KEY_DASHBOARD);
    if (cached && cached.data && Object.keys(cached.data).length > 0) {
        dashboardDataCache = cached;
        processApiData(cached);
    }

    // 2. Faz a chamada real na API (atualiza os dados em background)
    try {
        loading.classList.remove('hidden');
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/dashboard_data`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("API retornou " + res.status);
        const data = await res.json();

        if (data.error) {
            console.error("Erro do Servidor:", data.error);
            if (!cached) showUploadView();
            return;
        }

        if (data && data.data && Object.keys(data.data).length > 0) {
            dashboardDataCache = data;
            saveToCache(CACHE_KEY_DASHBOARD, data); // salva no localStorage para o proximo F5
            processApiData(data);
        } else {
            // Se a API retornou vazio, significa que este tenant (ex: visitante recém logado)
            // não tem dados. O cache antigo que foi renderizado deve ser apagado!
            localStorage.clear();
            showUploadView();
        }
    } catch (err) {
        console.error("Falha na API dashboard (Lambda frio?):", err);
        if (!cached) showUploadView();
    } finally {
        loading.classList.add('hidden');
    }
}

async function fetchReceitasData() {
    const cached = loadFromCache(CACHE_KEY_RECEITAS);
    if (cached) { receitasDataCache = cached; updateReceitasView(); }
    try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/receitas_data`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error("Erro na API receitas");
        const data = await res.json();
        if (data && data.data) {
            receitasDataCache = data.data;
            saveToCache(CACHE_KEY_RECEITAS, data.data);
            updateReceitasView();
        }
    } catch (err) { console.error("Falha receitas:", err); }
}

async function fetchRhData() {
    const cached = loadFromCache(CACHE_KEY_RH);
    if (cached) { rhDataCache = cached; updateRhView(); }
    try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/rh_data`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error("Erro na API rh");
        const data = await res.json();
        if (data && data.data) {
            rhDataCache = data.data;
            saveToCache(CACHE_KEY_RH, data.data);
            updateRhView();
        }
    } catch (err) { console.error("Falha rh:", err); }
}

async function fetchPerdasData() {
    try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/perdas_data`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error("Erro na API perdas");
        const data = await res.json();
        if (data && data.data) { perdasDataCache = data.data; updatePerdasView(); }
    } catch (err) { console.error("Falha perdas:", err); }
}


function formatCurrency(val) {
    if(!val) return 'R$ 0,00';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function showUploadView() {
    const navLinks = document.querySelectorAll('.nav-link');
    const views = document.querySelectorAll('.view-container');
    navLinks.forEach(l => l.classList.remove('active'));
    views.forEach(v => v.classList.add('hidden'));
    
    document.querySelector('[data-target="view-integracoes"]').classList.add('active');
    document.getElementById('view-integracoes').classList.remove('hidden');
    document.getElementById('pageTitle').innerText = 'Configurações & Upload';
}

// File Upload Handler (Envio para o Backend Python)
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    loading.classList.remove('hidden');

    const formData = new FormData();
    formData.append("file", file);

    try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const result = await res.json();
        if (result.error) {
            alert("Erro: " + result.error);
        } else {
            // Upload com sucesso - invalida todos os caches para forcar recarga limpa
            dashboardDataCache = null;
            receitasDataCache = null;
            rhDataCache = null;
            perdasDataCache = null;
            await fetchDashboardData();
        }
    } catch (err) {
        alert('Erro ao enviar planilha para o servidor: ' + err.message);
    } finally {
        loading.classList.add('hidden');
        fileInput.value = ''; // reseta o input
    }
});

function processApiData(apiResponse) {
    try {
        globalData = apiResponse;

        if (apiResponse.insights) {
            document.getElementById('valAntecipacao').innerText = formatMoney(apiResponse.insights.total_antecipacao || 0);
            document.getElementById('pctAntecipacao').innerText = formatPct(apiResponse.insights.impacto_antecipacao_pct || 0);
            document.getElementById('valPrevisao').innerText = formatMoney(apiResponse.insights.previsao_proximo_mes_vendas || 0);
        } else {
            console.warn("API retornou sem insights.");
        }

        let select = document.getElementById('yearSelect');
        select.innerHTML = '';
        if (apiResponse.data && Object.keys(apiResponse.data).length > 0) {
            Object.keys(apiResponse.data).sort((a,b)=>b-a).forEach(y => {
                let opt = document.createElement('option');
                opt.value = y; opt.innerText = `Ano: ${y}`;
                select.appendChild(opt);
            });
            if (select.value) {
                renderYear(select.value);
            }
        } else {
            document.getElementById('pageTitle').innerText = "Erro: Dados vazios retornados!";
        }
    } catch (e) {
        document.getElementById('pageTitle').innerText = "CRASH JS: " + e.message;
        console.error(e);
    }
}

// ---- Chart Logic ----
document.getElementById('yearSelect').addEventListener('change', (e) => { 
    renderYear(e.target.value); 
    if(receitasDataCache) updateReceitasView();
    if(rhDataCache) updateRhView();
    if(perdasDataCache) updatePerdasView();
    updateCustosView();
});

function renderYear(year) {
    const data = globalData.data[year];
    if(!data) return;
    const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
    const avg = (arr) => { const valid = arr.filter(x => x !== null); return valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : 0; };
    
    document.getElementById('kpiVendas').innerText = formatMoney(sum(data.vendas));
    document.getElementById('kpiRO').innerText = formatMoney(sum(data.ro));
    document.getElementById('kpiTM').innerText = formatMoney(avg(data.tm));
    document.getElementById('kpiFluxo').innerText = formatNum(sum(data.fluxo));

    document.getElementById('valAntecipacaoAno').innerText = formatMoney(sum(data.taxa_antecipacao));

    updateChartVendasRO(data);
    updateChartDespesas(data);
    updateChartDelivery(data);
}

function updateReceitasView() {
    if(!receitasDataCache) return;
    const year = document.getElementById('yearSelect').value || "2024";
    const data = receitasDataCache[year];
    if(!data) return;
    
    const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
    
    const totDinheiro = sum(data.dinheiro);
    const totPix = sum(data.pix);
    const totCredito = sum(data.credito);
    const totDebito = sum(data.debito);
    const totCaderneta = sum(data.caderneta);
    
    document.getElementById('kpiLiquidez').innerText = formatCurrency(totDinheiro + totPix);
    document.getElementById('kpiCartoes').innerText = formatCurrency(totCredito + totDebito);
    document.getElementById('kpiCaderneta').innerText = formatCurrency(totCaderneta);
    
    // Calcula TM Geral das Receitas usando o cache da visão geral
    if(dashboardDataCache && dashboardDataCache.data[year]) {
        const d_vendas = sum(dashboardDataCache.data[year].vendas);
        const d_fluxo = sum(dashboardDataCache.data[year].fluxo);
        document.getElementById('kpiTicketReceitas').innerText = formatCurrency(d_fluxo ? (d_vendas / d_fluxo) : 0);
    }
    
    // Grafico Caderneta (Risco)
    const ctxCaderneta = document.getElementById('chartCaderneta').getContext('2d');
    if(charts.caderneta) charts.caderneta.destroy();
    charts.caderneta = new Chart(ctxCaderneta, {
        type: 'line',
        data: { labels: months, datasets: [
            { label: 'Fiado (Caderneta)', data: data.caderneta, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.4 }
        ]},
        options: { responsive: true, scales: { y: { grid: { color: 'rgba(65, 74, 99, 0.05)' }, ticks: { color: '#8d97ad' } }, x: { grid: { display: false }, ticks: { color: '#8d97ad' } } }, plugins: { legend: { labels: { color: '#414a63' } } } }
    });
    
    // Grafico Composicao
    const ctxPagamentos = document.getElementById('chartPagamentos').getContext('2d');
    if(charts.pagamentos) charts.pagamentos.destroy();
    charts.pagamentos = new Chart(ctxPagamentos, {
        type: 'doughnut',
        data: { labels: ['PIX', 'Cartão (C/D)', 'Dinheiro', 'Caderneta'], datasets: [{ data: [totPix, (totCredito+totDebito), totDinheiro, totCaderneta], backgroundColor: ['#36b37e', '#4a7af7', '#f59e0b', '#ef4444'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#414a63' } } } }
    });
}

function updateCustosView() {
    if(!dashboardDataCache) return;
    const year = document.getElementById('yearSelect').value || "2024";
    const data = dashboardDataCache.data[year];
    if(!data) return;
    
    const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
    const totDespesas = sum(data.despesas);
    const totVendas = sum(data.vendas);
    const margem = totVendas ? ((totVendas - totDespesas) / totVendas) * 100 : 0;
    
    document.getElementById('kpiCustosTotal').innerText = formatCurrency(totDespesas);
    document.getElementById('kpiMargem').innerText = margem.toFixed(1) + "%";
    
    const ctxCustos = document.getElementById('chartCustosEvolucao').getContext('2d');
    if(charts.custosEvolucao) charts.custosEvolucao.destroy();
    charts.custosEvolucao = new Chart(ctxCustos, {
        type: 'line',
        data: { labels: months, datasets: [
            { label: 'Despesas', data: data.despesas, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4 },
            { label: 'Resultado Operacional', data: data.ro, borderColor: '#36b37e', backgroundColor: 'rgba(54, 179, 126, 0.1)', fill: true, tension: 0.4 }
        ]},
        options: { responsive: true, scales: { y: { grid: { color: 'rgba(65, 74, 99, 0.05)' } }, x: { grid: { display: false } } }, plugins: { legend: { labels: { color: '#414a63' } } } }
    });
}

function updateRhView() {
    if(!rhDataCache) return;
    const year = document.getElementById('yearSelect').value || "2024";
    const data = rhDataCache[year];
    if(!data) return;
    
    const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
    const totFolha = sum(data.folha);
    const totRescisao = sum(data.rescisao);
    
    document.getElementById('kpiFolha').innerText = formatCurrency(totFolha);
    document.getElementById('kpiRescisao').innerText = formatCurrency(totRescisao);
    
    const ctxRh = document.getElementById('chartRH').getContext('2d');
    if(charts.rh) charts.rh.destroy();
    charts.rh = new Chart(ctxRh, {
        type: 'bar',
        data: { labels: months, datasets: [
            { label: 'Folha de Pagamento', data: data.folha, backgroundColor: '#4a7af7' },
            { label: 'Rescisões', data: data.rescisao, backgroundColor: '#ef4444' }
        ]},
        options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true } } }
    });
}

function updatePerdasView() {
    if(!perdasDataCache) return;
    const year = document.getElementById('yearSelect').value || "2024";
    const data = perdasDataCache[year];
    if(!data) return;
    
    const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
    
    const perdasSetores = {
        'Confeitaria': sum(data.confeitaria),
        'Produção': sum(data.producao),
        'Pizza': sum(data.pizza),
        'Cozinha': sum(data.cozinha),
        'Sushi': sum(data.sushi),
        'Atendimento': sum(data.atendimento)
    };
    
    let worstSector = 'Nenhum';
    let worstVal = 0;
    let fallbackTotalPerdas = 0;
    for(let k in perdasSetores) {
        fallbackTotalPerdas += perdasSetores[k];
        if(perdasSetores[k] > worstVal) { worstVal = perdasSetores[k]; worstSector = k; }
    }
    
    // Se o ETL não achou a linha 'Total' ou 'Vendas', usamos as somas manuais
    const totPerdas = sum(data.total_perdas) || fallbackTotalPerdas;
    const totVendas = sum(data.total_vendas) || (globalData && globalData.data[year] ? sum(globalData.data[year].vendas) : 0);
    const impacto = totVendas ? (totPerdas / totVendas) * 100 : 0;
    
    document.getElementById('kpiPerdaTotal').innerText = formatCurrency(totPerdas);
    document.getElementById('kpiSetorCritico').innerText = worstSector;
    document.getElementById('kpiImpactoVendas').innerText = impacto.toFixed(2) + "%";
    
    // Doughnut
    const ctxPerdas = document.getElementById('chartPerdasDoughnut').getContext('2d');
    if(charts.perdasDough) charts.perdasDough.destroy();
    charts.perdasDough = new Chart(ctxPerdas, {
        type: 'doughnut',
        data: { labels: Object.keys(perdasSetores), datasets: [{ data: Object.values(perdasSetores), backgroundColor: ['#f59e0b', '#ef4444', '#36b37e', '#4a7af7', '#8b5cf6', '#ec4899'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#414a63' } } } }
    });
    
    // Line
    const ctxPerdasL = document.getElementById('chartPerdasLinha').getContext('2d');
    if(charts.perdasLinha) charts.perdasLinha.destroy();
    charts.perdasLinha = new Chart(ctxPerdasL, {
        type: 'line',
        data: { labels: months, datasets: [
            { label: 'Perdas Totais', data: data.total_perdas, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.4 }
        ]},
        options: { responsive: true, scales: { y: { grid: { color: 'rgba(65, 74, 99, 0.05)' } }, x: { grid: { display: false } } } }
    });
}

function updateChartVendasRO(data) {
    const ctx = document.getElementById('chartVendasRO').getContext('2d');
    if(charts.vendasRO) charts.vendasRO.destroy();
    charts.vendasRO = new Chart(ctx, {
        type: 'bar',
        data: { labels: months, datasets: [
            { label: 'Vendas Brutas', data: data.vendas, backgroundColor: '#4a7af7', borderRadius: 4 },
            { label: 'Resultado Operacional', data: data.ro, type: 'line', borderColor: '#36b37e', backgroundColor: '#36b37e', borderWidth: 3, tension: 0.4 }
        ]},
        options: { responsive: true, scales: { y: { grid: { color: 'rgba(65, 74, 99, 0.05)' }, ticks: { color: '#8d97ad' } }, x: { grid: { display: false }, ticks: { color: '#8d97ad' } } }, plugins: { legend: { labels: { color: '#414a63', font: { weight: '600' } } } } }
    });
}

function updateChartDespesas(data) {
    const ctx = document.getElementById('chartDespesas').getContext('2d');
    if(charts.despesas) charts.despesas.destroy();
    const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
    const taxasCartao = sum(data.taxa_cartao);
    const taxasAntecip = sum(data.taxa_antecipacao);
    const totalDespesas = sum(data.despesas);
    const outrasDespesas = totalDespesas - taxasCartao - taxasAntecip;
    charts.despesas = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Taxa Cartão', 'Taxa Antecipação', 'Outras Despesas'], datasets: [{ data: [taxasCartao, taxasAntecip, outrasDespesas], backgroundColor: ['#f59e0b', '#ef4444', '#4a7af7'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#414a63', font: { weight: '600' } } } } }
    });
}

function updateChartDelivery(data) {
    const ctx = document.getElementById('chartDelivery').getContext('2d');
    if(charts.delivery) charts.delivery.destroy();
    charts.delivery = new Chart(ctx, {
        type: 'line',
        data: { labels: months, datasets: [
            { label: 'Vendas Loja', data: data.vendas, borderColor: '#4a7af7', backgroundColor: 'rgba(74, 122, 247, 0.1)', fill: true, tension: 0.4 },
            { label: 'Vendas Delivery', data: data.delivery_vendas, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4 }
        ]},
        options: { responsive: true, scales: { y: { grid: { color: 'rgba(65, 74, 99, 0.05)' }, ticks: { color: '#8d97ad' } }, x: { grid: { display: false }, ticks: { color: '#8d97ad' } } }, plugins: { legend: { labels: { color: '#414a63', font: { weight: '600' } } } } }
    });
}

// ---- PDF Gen ----
btnExportPDF.addEventListener('click', () => {
    const year = document.getElementById('yearSelect').value;
    const activeTab = document.querySelector('.nav-link.active').getAttribute('data-target');
    let title = "";
    let content = "";
    const sum = (arr) => arr ? arr.reduce((a, b) => a + (b || 0), 0) : 0;
    
    if (activeTab === 'view-visao-geral') {
        if(!globalData || !globalData.data[year]) return alert("Dados não carregados.");
        const data = globalData.data[year];
        title = "Relatório de Visão Geral";
        let vendas = sum(data.vendas);
        let ro = sum(data.ro);
        let roPct = vendas ? (ro / vendas * 100).toFixed(1) : 0;
        let prev = globalData.insights.previsao_proximo_mes_vendas;
        content = `
            <p>Este relatório apresenta um resumo executivo da performance da empresa no ano de <strong>${year}</strong>.</p>
            <p>O faturamento bruto acumulado atingiu a marca de <strong>${formatMoney(vendas)}</strong>. O Resultado Operacional (RO), que representa a eficiência real de geração de caixa do negócio, fechou em <strong>${formatMoney(ro)}</strong> (uma margem de <strong>${roPct}%</strong>).</p>
            <p>Durante o período, identificamos através de nossos motores de inteligência que a empresa perdeu <strong>${formatMoney(globalData.insights.total_antecipacao)}</strong> diretamente em taxas de antecipação de cartão. O impacto dessa drenagem equivale a <strong>${formatPct(globalData.insights.impacto_antecipacao_pct)}</strong> de todo o Lucro Real acumulado no ano.</p>
            <p>Com base no comportamento histórico e aplicando Médias Móveis Ponderadas (WMA), o sistema preditivo projeta um faturamento bruto de <strong>${formatMoney(prev)}</strong> para o próximo mês, assumindo a manutenção das condições normais de operação.</p>
        `;
    } else if (activeTab === 'view-receitas') {
        if(!receitasDataCache || !receitasDataCache[year]) return alert("Dados não carregados.");
        const data = receitasDataCache[year];
        title = "Relatório de Receitas e Pagamentos";
        let din = sum(data.dinheiro);
        let cred = sum(data.credito);
        let deb = sum(data.debito);
        let pix = sum(data.pix);
        let total = din + cred + deb + pix;
        let cartoes = cred + deb;
        let cartoesPct = total ? (cartoes / total * 100).toFixed(1) : 0;
        content = `
            <p>Análise detalhada das formas de recebimento e receitas no ano de <strong>${year}</strong>.</p>
            <p>A distribuição dos pagamentos revela a forte predominância dos meios digitais. O pagamento via Cartão (Crédito e Débito) somou <strong>${formatMoney(cartoes)}</strong>, correspondendo a <strong>${cartoesPct}%</strong> das transações mapeadas.</p>
            <p>O volume transacionado em PIX totalizou <strong>${formatMoney(pix)}</strong>, enquanto os pagamentos em espécie (Dinheiro) ficaram em <strong>${formatMoney(din)}</strong>.</p>
            <p><strong>Insight Estratégico:</strong> O alto volume de pagamentos em cartões reforça a urgência em renegociar taxas de adquirência e evitar a antecipação automática, que corrói de forma grave a margem líquida do negócio.</p>
        `;
    } else if (activeTab === 'view-custos') {
        if(!globalData || !globalData.data[year]) return alert("Dados não carregados.");
        const data = globalData.data[year];
        title = "Relatório de Custos e CMV";
        let vendas = sum(data.vendas);
        let desp = sum(data.despesas);
        let cmvPct = vendas ? (desp / vendas * 100).toFixed(1) : 0;
        let statusCmv = cmvPct > 40 ? "Atenção Crítica: O CMV está acima da margem considerada saudável." : "Saudável: O CMV está controlado e dentro da margem aceitável.";
        content = `
            <p>Este documento detalha o comportamento dos Custos das Mercadorias Vendidas (CMV) e Despesas Operacionais no ano de <strong>${year}</strong>.</p>
            <p>As despesas totais registradas ao longo do ano foram de <strong>${formatMoney(desp)}</strong>. Relacionando este valor com o faturamento bruto, temos um índice de CMV médio de <strong>${cmvPct}%</strong>.</p>
            <p><strong>Avaliação do Algoritmo:</strong> ${statusCmv}</p>
            <p>Manter o controle rígido do CMV através de redução de desperdícios, cotação estratégica com múltiplos fornecedores e controle de estoque é o fator mais determinante para proteger o Resultado Operacional.</p>
        `;
    } else if (activeTab === 'view-rh') {
        if(!rhDataCache || !rhDataCache[year]) return alert("Dados não carregados.");
        const data = rhDataCache[year];
        title = "Relatório de RH e Operação";
        let folha = sum(data.folha);
        let inss = sum(data.inss);
        let rescisao = sum(data.rescisao);
        let totalRh = folha + inss + rescisao;
        content = `
            <p>Resumo dos custos trabalhistas e operacionais da equipe no ano de <strong>${year}</strong>.</p>
            <p>O custo total com Recursos Humanos (Folha, Encargos e Rescisões) atingiu a marca de <strong>${formatMoney(totalRh)}</strong> no período analisado.</p>
            <p>A maior parcela deste valor concentra-se na Folha de Pagamento base, que representou <strong>${formatMoney(folha)}</strong>. Os encargos tributários diretos contabilizaram <strong>${formatMoney(inss)}</strong>. Adicionalmente, o custo isolado com rotatividade (Rescisões) foi de <strong>${formatMoney(rescisao)}</strong>.</p>
            <p><strong>Recomendação:</strong> Fique atento à taxa de rescisão. A alta rotatividade não apenas onera o caixa da empresa como também prejudica diretamente a qualidade do atendimento, a cultura organizacional e a constância dos produtos.</p>
        `;
    } else if (activeTab === 'view-perdas') {
        if(!perdasDataCache || !perdasDataCache[year]) return alert("Dados não carregados.");
        const data = perdasDataCache[year];
        title = "Relatório de Controle de Perdas";
        let fallbackTotal = 0;
        const perdasSetores = {
            'Confeitaria': sum(data.confeitaria),
            'Produção': sum(data.producao),
            'Pizza': sum(data.pizza),
            'Cozinha': sum(data.cozinha),
            'Sushi': sum(data.sushi),
            'Atendimento': sum(data.atendimento)
        };
        for(let k in perdasSetores) { fallbackTotal += perdasSetores[k]; }
        
        let totPerdas = sum(data.total_perdas) || fallbackTotal;
        let totVendas = sum(data.total_vendas) || (globalData && globalData.data[year] ? sum(globalData.data[year].vendas) : 0);
        let impacto = totVendas ? (totPerdas / totVendas * 100).toFixed(2) : 0;
        
        let worstSector = 'Nenhum';
        let worstVal = 0;
        for(let k in perdasSetores) {
            if(perdasSetores[k] > worstVal) { worstVal = perdasSetores[k]; worstSector = k; }
        }

        content = `
            <p>Análise de quebras, desperdícios e perdas operacionais durante o ano de <strong>${year}</strong>.</p>
            <p>No acumulado do ano, a empresa registrou <strong>${formatMoney(totPerdas)}</strong> em perdas catalogadas (produtos vencidos, erros na confecção, devoluções, etc). Isso representa uma corrosão direta de <strong>${impacto}%</strong> sobre o faturamento total.</p>
            <p>O setor identificado pelo algoritmo como o maior ofensor do sistema foi <strong>${worstSector}</strong>, sendo responsável por perdas de <strong>${formatMoney(worstVal)}</strong> isoladamente.</p>
            <p><strong>Plano de Ação:</strong> Direcionar esforços de controle de qualidade e gestão (como revisão de fichas técnicas, treinamento de equipe e ajuste fino do volume de produção) para o setor de ${worstSector} trará o retorno mais rápido em economia real para a empresa.</p>
        `;
    } else {
        return alert("O relatório não está disponível para esta tela.");
    }

    const htmlContent = `
        <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; background: white;">
            <div style="border-bottom: 3px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px;">
                <h1 style="color: #0f172a; margin: 0; font-size: 28px; font-weight: 800;">Apex Analytics - Relatório de Inteligência</h1>
                <p style="color: #64748b; margin: 5px 0 0 0; font-size: 16px; font-weight: 600;">Cliente: Apex Tenant | Exercício: ${year}</p>
            </div>
            <h2 style="color: #3b82f6; font-size: 22px; margin-bottom: 25px;">${title}</h2>
            <div style="font-size: 16px; line-height: 1.8; text-align: justify; color: #334155;">
                ${content}
            </div>
            <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
                Documento gerado automaticamente pelo Motor Preditivo Apex Analytics em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}.
            </div>
        </div>
    `;

    const container = document.getElementById('pdf-report-container');
    container.innerHTML = htmlContent;
    container.classList.remove('hidden');

    const opt = {
        margin:       0.5,
        filename:     `Apex_${title.replace(/ /g, '_')}_${year}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(container).save().then(() => {
        container.classList.add('hidden');
    });
});
