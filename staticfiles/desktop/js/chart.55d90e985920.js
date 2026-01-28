const dados = JSON.parse(
    document.getElementById('grafico-data').textContent
);

const entregasChart = new Chart(
    document.getElementById('entregasChart'),
    {
        type: 'line',
        data: {
            labels: dados.labels,
            datasets: [{
                label: 'Total de Entregas (Acumulado)',
                data: dados.valores,
                fill: true, // Preenchimento abaixo da linha
                backgroundColor: 'rgba(59, 130, 246, 0.1)', // Azul suave (estilo Tailwind)
                borderColor: 'rgb(59, 130, 246)',
                borderWidth: 3,
                pointBackgroundColor: 'rgb(59, 130, 246)',
                pointRadius: 4,
                tension: 0.4 // Deixa a linha curvada (mais elegante)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false } // Remove a legenda para ganhar espaço
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 } // Como são notas fiscais, usamos números inteiros
                },
                x: {
                    grid: { display: false } // Remove as linhas de grade verticais
                }
            }
        }
    }
);