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
                label: 'Entregas',
                data: dados.valores,
                fill: false,
                tension: 0.3
            }]
        }
    }
);
