// server.js
const dgram = require('dgram');
const http = require('http');

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Responde ao preflight OPTIONS
    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        return res.end();
    }

    if (req.method === 'POST' && req.url === '/send_udp') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { ip, port, imei, cmd } = JSON.parse(body);

                const imeiLimpo = imei.toString().trim();

                let imeiBuffer;
                imeiBuffer = BigInt(imeiLimpo);

                const imeiBytes = Buffer.alloc(8);
                imeiBytes.writeBigUInt64BE(imeiBuffer);

                if (!ip || !port || !cmd) {
                    return res.end(JSON.stringify({ success: false, error: 'Parâmetros inválidos' }));
                }

                if(!imei) {
                    imeiBuffer = BigInt(0);
                } else {
                    imeiBuffer = BigInt(imei);
                }
                imeiBytes.writeBigUInt64BE(imeiBuffer);

                const message = Buffer.concat([
                    Buffer.from([0x77]),
                    imeiBytes,
                    Buffer.from(cmd),
                    Buffer.from([0x77])
                ]);
                const client = dgram.createSocket('udp4');

                client.send(message, port, ip, (err) => {
                    client.close();
                    if (err) {
                        res.end(JSON.stringify({ success: false, error: err.message }));
                    } else {
                        res.end(JSON.stringify({ success: true, sent: cmd, to: `${ip}:${port}`, bytes: message.length }));
                    }
                });
            } catch (e) {
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
    } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

server.listen(3000, () => console.log('Servidor rodando na porta 3000'));