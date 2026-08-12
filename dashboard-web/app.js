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
const btnExportPPTX = document.getElementById('btnExportPPTX');

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
            if (!cached) showUploadView(); // so vai pra upload se nao havia cache
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
    
    const totPerdas = sum(data.total_perdas);
    const totVendas = sum(data.total_vendas);
    const impacto = totVendas ? (totPerdas / totVendas) * 100 : 0;
    
    let worstSector = 'Nenhum';
    let worstVal = 0;
    for(let k in perdasSetores) {
        if(perdasSetores[k] > worstVal) { worstVal = perdasSetores[k]; worstSector = k; }
    }
    
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

// ---- PPTX Gen ----
btnExportPPTX.addEventListener('click', () => {
    if(!globalData) return;
    
    let pres = new PptxGenJS();
    pres.author = 'Apex Analytics';
    pres.company = 'Cliente: Padaria Araujo';
    pres.title = 'Apresentação de Resultados';
    pres.layout = 'LAYOUT_16x9';

    // Slide 1: Capa
    let slideCapa = pres.addSlide();
    slideCapa.background = { color: "0f1115" };
    slideCapa.addText("Padaria Araujo", { x: 0, y: 1.5, w: "100%", fontSize: 54, color: "ffffff", bold: true, align: "center" });
    slideCapa.addText("Relatório de Inteligência Executiva", { x: 0, y: 2.8, w: "100%", fontSize: 26, color: "3b82f6", align: "center" });
    slideCapa.addText("Gerado automaticamente pelo Motor de Dados", { x: 0, y: 5.0, w: "100%", fontSize: 14, color: "94a3b8", align: "center" });

    // Slide 2: O Ralo Invisível
    let slideRalo = pres.addSlide();
    slideRalo.background = { color: "ffffff" };
    slideRalo.addText("⚠️ Drenagem de Caixa: Taxas de Antecipação", { x: 0.5, y: 0.5, w: "90%", fontSize: 32, bold: true, color: "ef4444" });
    
    let raloText = [
        { text: "Durante o período analisado, a empresa perdeu exatos ", options: { fontSize: 20, color: "333333" } },
        { text: formatMoney(globalData.insights.total_antecipacao), options: { fontSize: 22, color: "ef4444", bold: true } },
        { text: " apenas em taxas de antecipação de cartão.\n\nIsso representa uma destruição direta de ", options: { fontSize: 20, color: "333333" } },
        { text: formatPct(globalData.insights.impacto_antecipacao_pct), options: { fontSize: 22, color: "ef4444", bold: true } },
        { text: " de todo o seu Lucro Operacional real.\n\n", options: { fontSize: 20, color: "333333" } },
        { text: "Recomendação Estratégica:\n", options: { fontSize: 22, color: "3b82f6", bold: true } },
        { text: "Negociar carência com a adquirente ou criar fundo de reserva para diminuir a antecipação agressiva.", options: { fontSize: 18, color: "555555" } }
    ];
    slideRalo.addText(raloText, { x: 0.5, y: 1.8, w: "90%", h: 3, lineSpacing: 35 });

    // Slide 3: Projeções de Machine Learning
    let slideProj = pres.addSlide();
    slideProj.background = { color: "ffffff" };
    slideProj.addText("📈 Projeção Preditiva (Próximo Mês)", { x: 0.5, y: 0.5, w: "90%", fontSize: 32, bold: true, color: "10b981" });
    
    let projText = [
        { text: "Baseado na regressão matemática linear dos últimos 6 meses de faturamento, a projeção de vendas brutas para o próximo mês é de:\n\n", options: { fontSize: 20, color: "333333" } },
        { text: formatMoney(globalData.insights.previsao_proximo_mes_vendas) + "\n\n", options: { fontSize: 36, color: "10b981", bold: true, align: "center" } },
        { text: "Aviso: Esta projeção considera a inércia atual do negócio e não prevê picos de feriados excepcionais.", options: { fontSize: 16, color: "94a3b8", italic: true } }
    ];
    slideProj.addText(projText, { x: 0.5, y: 1.8, w: "90%", h: 3 });

    // Save
    pres.writeFile({ fileName: 'Apresentacao_Executiva_Araujo.pptx' });
});
