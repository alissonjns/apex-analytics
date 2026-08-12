const formatMoney = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const formatNum = (val) => new Intl.NumberFormat('pt-BR').format(val);
const formatPct = (val) => val.toFixed(1) + '%';
const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
let globalData = null;
let charts = {};

// DOM Elements
const uploadScreen = document.getElementById('uploadScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
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
});

// Fetch Data from Backend
async function fetchDashboardData() {
    try {
        loading.classList.remove('hidden');
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/dashboard_data`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) throw new Error("Erro na API");
        const data = await res.json();
        
        if (data.error) {
            alert("Erro do Servidor: " + data.error + "\n\n" + data.trace);
            uploadScreen.classList.remove('hidden');
            dashboardScreen.classList.add('hidden');
            return;
        }
        
        if (data && data.data && Object.keys(data.data).length > 0) {
            processApiData(data);
            uploadScreen.classList.add('hidden');
            dashboardScreen.classList.remove('hidden');
        } else {
            // No data in DB yet
            uploadScreen.classList.remove('hidden');
            dashboardScreen.classList.add('hidden');
        }
    } catch (err) {
        console.error("No database connection or empty data", err);
        uploadScreen.classList.remove('hidden');
        dashboardScreen.classList.add('hidden');
    } finally {
        loading.classList.add('hidden');
    }
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
            // Upload com sucesso, agora busca os dados processados!
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
    globalData = apiResponse;

    // Os insights agora vêm direto do servidor, não precisamos calcular no JS!
    
    // Fill UI
    document.getElementById('valAntecipacao').innerText = formatMoney(apiResponse.insights.total_antecipacao);
    document.getElementById('pctAntecipacao').innerText = formatPct(apiResponse.insights.impacto_antecipacao_pct);
    document.getElementById('valPrevisao').innerText = formatMoney(apiResponse.insights.previsao_proximo_mes_vendas);

    let select = document.getElementById('yearSelect');
    select.innerHTML = '';
    Object.keys(apiResponse.data).sort((a,b)=>b-a).forEach(y => {
        let opt = document.createElement('option');
        opt.value = y; opt.innerText = `Ano: ${y}`;
        select.appendChild(opt);
    });
    
    if (select.value) {
        renderYear(select.value);
    }
}

// ---- Chart Logic ----
document.getElementById('yearSelect').addEventListener('change', (e) => { renderYear(e.target.value); });

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

function updateChartVendasRO(data) {
    const ctx = document.getElementById('chartVendasRO').getContext('2d');
    if(charts.vendasRO) charts.vendasRO.destroy();
    charts.vendasRO = new Chart(ctx, {
        type: 'bar',
        data: { labels: months, datasets: [
            { label: 'Vendas Brutas', data: data.vendas, backgroundColor: 'rgba(59, 130, 246, 0.8)', borderRadius: 4 },
            { label: 'Resultado Operacional', data: data.ro, type: 'line', borderColor: '#10b981', backgroundColor: '#10b981', borderWidth: 3, tension: 0.4 }
        ]},
        options: { responsive: true, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } }, plugins: { legend: { labels: { color: '#e2e8f0' } } } }
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
        data: { labels: ['Taxa Cartão', 'Taxa Antecipação', 'Outras Despesas'], datasets: [{ data: [taxasCartao, taxasAntecip, outrasDespesas], backgroundColor: ['#f59e0b', '#ef4444', '#3b82f6'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#e2e8f0' } } } }
    });
}

function updateChartDelivery(data) {
    const ctx = document.getElementById('chartDelivery').getContext('2d');
    if(charts.delivery) charts.delivery.destroy();
    charts.delivery = new Chart(ctx, {
        type: 'line',
        data: { labels: months, datasets: [
            { label: 'Vendas Loja', data: data.vendas, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4 },
            { label: 'Vendas Delivery', data: data.delivery_vendas, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4 }
        ]},
        options: { responsive: true, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } }, plugins: { legend: { labels: { color: '#e2e8f0' } } } }
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
