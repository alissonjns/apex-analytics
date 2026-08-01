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

// File Upload Handler (100% Local)
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    loading.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            processWorkbook(workbook);
            loading.classList.add('hidden');
            uploadScreen.classList.add('hidden');
            dashboardScreen.classList.remove('hidden');
        } catch (err) {
            alert('Erro ao processar planilha: ' + err.message);
            loading.classList.add('hidden');
        }
    };
    reader.readAsArrayBuffer(file);
});

// Engine JS (Substitui o Python)
function cleanVal(x) {
    if (x === undefined || x === null || x === '') return null;
    if (typeof x === 'number') return isNaN(x) ? null : x;
    if (typeof x === 'string') {
        let s = x.replace(/R\$/gi, '').replace(/\./g, '').replace(/,/g, '.').trim();
        let n = parseFloat(s);
        return isNaN(n) ? null : n;
    }
    return null;
}

function extractRow(matrix, keyword, startRow = 0, endRow = null) {
    keyword = keyword.toLowerCase().trim();
    let limit = endRow ? endRow : matrix.length;
    for (let r = startRow; r < limit; r++) {
        let row = matrix[r];
        if (!row) continue;
        for (let c = 0; c < row.length; c++) {
            let val = row[c];
            if (typeof val === 'string' && val.toLowerCase().trim() === keyword) {
                let data = [];
                for (let i = c + 1; i < row.length; i++) {
                    let v = cleanVal(row[i]);
                    if (v !== null || (data.length > 0 && data.length < 12)) data.push(v);
                    if (data.length === 12) break;
                }
                while (data.length < 12) data.push(null);
                return data;
            }
        }
    }
    return Array(12).fill(null);
}

function processWorkbook(workbook) {
    let results = { data: {}, insights: {} };
    
    workbook.SheetNames.filter(name => name.startsWith('Receita ')).forEach(sheetName => {
        let ws = workbook.Sheets[sheetName];
        if (!ws) return;
        let matrix = XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: null});
        
        // Separa Loja de Delivery
        let deliveryRow = -1;
        for (let r = 0; r < matrix.length; r++) {
            if (matrix[r].some(cell => typeof cell === 'string' && cell.toLowerCase().includes('delivery'))) {
                deliveryRow = r; break;
            }
        }

        let vendas = extractRow(matrix, 'vendas', 0, deliveryRow > -1 ? deliveryRow : null);
        let fluxo = extractRow(matrix, 'fluxo', 0, deliveryRow > -1 ? deliveryRow : null);
        let tm = extractRow(matrix, 'tm', 0, deliveryRow > -1 ? deliveryRow : null);
        
        let despesas = extractRow(matrix, 'despesas');
        let ro = extractRow(matrix, 'ro');
        if (ro.filter(x => x===null).length === 12) ro = extractRow(matrix, 'rlo');
        
        let taxa_cartao = extractRow(matrix, 'taxa cartão');
        if (taxa_cartao.filter(x => x===null).length === 12) taxa_cartao = extractRow(matrix, 'taxa cartao');
        
        let taxa_antecip = extractRow(matrix, 'taxa antecipação');
        if (taxa_antecip.filter(x => x===null).length === 12) taxa_antecip = extractRow(matrix, 'taxa antecipacao');
        
        let deliv_vendas = deliveryRow > -1 ? extractRow(matrix, 'vendas', deliveryRow) : Array(12).fill(null);

        results.data[sheetName.replace('Receita ', '')] = {
            vendas, fluxo, tm, despesas, ro, taxa_cartao, taxa_antecipacao: taxa_antecip, delivery_vendas: deliv_vendas
        };
    });

    // Insights Engine
    let total_antecip = 0;
    let total_ro = 0;
    let sales_history = [];
    
    Object.keys(results.data).sort().forEach(y => {
        let d = results.data[y];
        d.taxa_antecipacao.forEach(x => { if(x) total_antecip += x; });
        d.ro.forEach(x => { if(x) total_ro += x; });
        d.vendas.forEach(x => { if(x) sales_history.push(x); });
    });

    // Previsão Regressão Linear Simples
    let next_month_pred = null;
    if (sales_history.length >= 6) {
        let y = sales_history.slice(-6);
        let n = y.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
            sumX += i; sumY += y[i]; sumXY += (i * y[i]); sumXX += (i * i);
        }
        let slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        let intercept = (sumY - slope * sumX) / n;
        next_month_pred = slope * n + intercept;
    }

    results.insights = {
        total_antecipacao: total_antecip,
        total_ro: total_ro,
        impacto_antecipacao_pct: total_ro > 0 ? (total_antecip / total_ro * 100) : 0,
        previsao_proximo_mes_vendas: next_month_pred
    };

    globalData = results;
    
    // Fill UI
    document.getElementById('valAntecipacao').innerText = formatMoney(results.insights.total_antecipacao);
    document.getElementById('pctAntecipacao').innerText = formatPct(results.insights.impacto_antecipacao_pct);
    document.getElementById('valPrevisao').innerText = formatMoney(results.insights.previsao_proximo_mes_vendas);

    let select = document.getElementById('yearSelect');
    select.innerHTML = '';
    Object.keys(results.data).sort((a,b)=>b-a).forEach(y => {
        let opt = document.createElement('option');
        opt.value = y; opt.innerText = `Ano: ${y}`;
        select.appendChild(opt);
    });
    
    renderYear(select.value);
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
    pres.author = 'Araujo BI';
    pres.company = 'Padaria Araujo';
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
