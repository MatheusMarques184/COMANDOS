import { createSocket } from 'dgram';
const server = createSocket('udp4');
import { parseLogin, parseLocation } from './packets.js';

const adress = "0.0.0.0";
const port = 9193;

const devices = new Map();

let GwSimple = false

function crcCCITT16(buffer, start, final) {
    const poly = 0x1021;
    let crc = 0xFFFF;

    for (let i = start; i < final; i++) {
        crc ^= (buffer[i] << 8);

        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ poly;
            } else {
                crc <<= 1;
            }
            crc &= 0xFFFF;
        }
    }

    return crc;
}

function createResponse(sequence) {
    const totalLength = 7; // 7 bytes fixed
    const response = Buffer.alloc(totalLength);
    let offset = 0;

    response.writeUInt8(0x40, offset++);

    const ack = 0x06;
    response.writeUInt8(ack, offset++);

    response.writeUInt16BE(sequence, offset);
    offset += 2;

    const transmit_crc = crcCCITT16(response, 1, offset);
    response.writeUInt16BE(transmit_crc, offset);
    offset += 2;

    response.writeUInt8(0x40, offset);

    return response;
}

function createCommand(imei, sequence, command) {
    const totalLength = 17 + command.length; // 17 bytes fixed
    const response = Buffer.alloc(totalLength);
    let offset = 0;

    response.writeUInt8(0x40, offset++);

    response.writeUInt8(0xCC, offset++);

    response.writeUInt16BE(totalLength-4, offset);
    offset += 2;

    response.writeUInt16BE(sequence, offset);
    offset += 2;

    response.writeBigUInt64BE(BigInt(imei), offset);
    offset += 8;

    response.write(command, offset);
    offset += command.length;

    const transmit_crc = crcCCITT16(response, 1, offset);
    response.writeUInt16BE(transmit_crc, offset);
    offset += 2;

    response.writeUInt8(0x40, offset);

    return response;
}

server.on('error', (err) => {
    console.error(`Server error: ${err.stack}`);
    server.close();
});

async function comandReceived(sequence, imei) {
    /*
    SPEEDBUZZ,150,0#
    SPEEDTIMED,50,1768591456#//VELOCIDADE MAXIMA DO BUZZER, EXPIRANDO NO UNIX TIMESTAMP
    RFID,1#
    RFIDRLY1,1#//ACIONA SAIDA1 EM CASO DE solicitacao de RFID
    RFIDRLY2,1#//ACIONA SAIDA2 EM CASO DE solicitacao de RFID
    MILEAGE=200#//SE MANDAR 200 FICARA COM 20,0 km... sim, é km mesmo, nao é milhas
    SECSMETER,4294967294#///numero de segundos que o veiculo esta em funcionamento(ignicao ligada)
    SERVER,1,trx.voxd.com.br,9092,0#
    APN,ss.algar.br,algar,algar#
    TIMER,30,1800#
    ACCLINE,0#
    RELAY,0#(0 descorta, 1 corta, ou quantidade de segundos para o corte com alarme de buzzer apos xxx segundos)
    OFFRELAY,0#//aciona e desaciona o descorte automatico
    RELAY2,0#//ativa e desativa rele 2
    OVSPDRLY2,1#//ACIONA SAIDA2 EM CASO DE OVERSPEED(#SPEEDBUZZ)
    SIMPIN,1212#//<ACTIVE_PIN>, para preservar o chip, o PIN sera enviado somente 2 vexes, a ultima fica reservado para manualmente retirar o pin 
    BUZZVOL,50#///BUZZER VOLUME PERCENT, FROM 0 TO 50(default 50)
    */
    console.log("Ack command Imei=%d, Sequence Code=%d", imei, sequence);

    try {
        ///await pool.connect();
       // const request = pool.request();
        const updateACK = `
            UPDATE SEND_COMMANDS 
            SET RECEIVED_ACK = 1 
            WHERE IMEI = @imei 
            AND SEQUENCE_COMMAND = @sequence
        `;
       // request.input('imei', BigInt(imei));
        //request.input('sequence', sequence);
        //await request.query(updateACK);
    } catch (error) {
        console.error('Error:', error);

    }
}

let lastAddres = '';
let lastPort = '';
let lastImei = '';

async function envioComandoViaWEB(msg) {
    const imeiBuffer = msg.slice(0, 8);
    const cmdBuffer  = msg.slice(8);

    const imeiRecebido = imeiBuffer.readBigUInt64BE().toString(); // lê como uint64
    const comandoRecebido = cmdBuffer.toString('utf8');           // lê como string

    console.log("imei recebido: " + imeiRecebido);
    console.log("comando recebido: " + comandoRecebido);

    if(comandoRecebido == "GwSimple#") {
        GwSimple = !GwSimple;
        return;
    }

    if(lastAddres == '' || lastImei == '' || lastPort == '') {
        console.log("coloque um rastreador para falar com o servidor antes");
        return false;
    }

    if(imeiRecebido !== "0") {
        const sendCommand = createCommand(imeiRecebido, 1, comandoRecebido);

        const targetDevice = devices.get(imeiRecebido);

        if (!targetDevice) return false;

        const targetIp = targetDevice.address;
        const targetPort = targetDevice.port;

        await new Promise((resolve, reject) => {
            server.send(sendCommand, targetPort, targetIp,  async (err) => {
                if (err) {
                    console.error('Erro on send command:', err);
                    reject(err);
                } else {
                    console.log(`Command sent: ${sendCommand.toString('hex').toUpperCase()}`)
                }
            });
        })

    return
    }

    const sendCommand = createCommand(lastImei, 1, comandoRecebido);

    await new Promise((resolve, reject) => {
        server.send(sendCommand, lastPort, lastAddres,  async (err) => {
            if (err) {
                console.error('Erro on send command:', err);
                reject(err);
            } else {
                console.log(`Command sent: ${sendCommand.toString('hex').toUpperCase()}`)
            }
        });
    })
}

server.on('message', async (msg, rinfo) => {

    console.log('____________________________________________________________________________________');
    console.log('____________________________________________________________________________________');
    console.log(`Received ${rinfo.size} bytes from ${rinfo.address}:${rinfo.port}: packet: ${msg.toString('hex').toUpperCase()}`);

     if (msg[0] == 0x77 && msg[msg.length - 1] == 0x77) {
        envioComandoViaWEB(msg.slice(1, -1));
        return;
    }
    
    if (msg[0] !== 0x40 || msg[msg.length - 1] !== 0x40) {
        return false;
    }

    const infoPacket = {
        eventRealTime: null,
        type: null,
        imei: null,
        sequence: null,
        quantityMiniPackets: null,
        receivedCrc: null,
        packetLength: null
    }

    infoPacket.receivedCrc= msg.readUInt16BE(msg.length -3);
    let msgWithoutCrc = [...msg.slice(1, msg.length - 3)]  
    const calculatedCrc = crcCCITT16(msgWithoutCrc, 0, msgWithoutCrc.length);
    console.log(`Received CRC: 0x${infoPacket.receivedCrc.toString(16).toUpperCase().padStart(4, '0')} Calculated CRC: 0x${calculatedCrc.toString(16).toUpperCase().padStart(4, '0')} CRC Correto? ${calculatedCrc === infoPacket.receivedCrc ? 'Sim' : 'Não'}`);
    if(calculatedCrc != infoPacket.receivedCrc){
        return false;
    }

    infoPacket.packetLength = msg.slice(2,4).readUint16BE();
    console.log("Size of received packet: %d, declared package size: %d", msgWithoutCrc.length, infoPacket.packetLength);
    if(infoPacket.packetLength != msgWithoutCrc.length) {
        return false;
    }

    msg.slice(3,4).readUInt8() == 1 ? infoPacket.eventRealTime = true : infoPacket.eventRealTime = false

    infoPacket.type = msg.slice(1,2).readUInt8();

    infoPacket.sequence = msg.slice(4,6).readUInt16BE();

    infoPacket.imei = msg.slice(6, 14).readBigUInt64BE(0).toString();

    infoPacket.quantityMiniPackets = msg.slice(14,15).readUInt8();

    console.log(infoPacket);

    lastAddres = `${rinfo.address}`;
    lastPort = `${rinfo.port}`;
    lastImei = infoPacket.imei;

    devices.set(infoPacket.imei, {
        address: rinfo.address,
        port: rinfo.port,
        lastSeen: new Date()
    });

     if (infoPacket.type == 0x06){
        console.log("ACK");
        comandReceived(infoPacket.sequence, infoPacket.imei);   
        return true;
    }
    
    if (infoPacket.type == 0x15) {
        console.log("NACK");
        return true;
    }

    let bufferOnlyPackets = msg.slice(15, msg.length-3);

    const response = createResponse(infoPacket.sequence);

    await server.send(response, rinfo.port, rinfo.address, async (err) => {
        if (err) {
            console.error('Error sending response: ' + err);
        } else {
            console.log(`Response sent: ${response.toString('hex').toUpperCase()}`);
        }
    });

    for (let index = 0; index < infoPacket.quantityMiniPackets; index++) {
        console.log(`-------------------------PACOTINHO: ${index}-------------------------`);
        let onePacketLength = bufferOnlyPackets[0];
        let receivedPacketCrc= bufferOnlyPackets.readUInt16BE(onePacketLength);
        const calculatedPacketCrc = crcCCITT16(bufferOnlyPackets, 0, onePacketLength);
        console.log(`CRC Recebido: 0x${receivedPacketCrc.toString(16).toUpperCase().padStart(4, '0')} CRC Calculado: 0x${calculatedPacketCrc.toString(16).toUpperCase().padStart(4, '0')} CRC Correto? ${receivedPacketCrc === calculatedPacketCrc ? 'Sim' : 'Não'}`);
        if(receivedPacketCrc != calculatedPacketCrc){
            return false;
        }  

        let packetType = bufferOnlyPackets.readUint8(1);

        if(GwSimple){
            switch (packetType) {
                case 0x01:
                    console.log("System info");
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;

                case 0x02:
                    console.log("Ligou IGN");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                
                case 0x03:
                    console.log("Desligou IGN");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x04:
                    console.log("Posicao normal");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x07:
                    console.log("Queda de energia");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x08:
                    console.log("Restauracao de energia");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x0A:
                    console.log("SAIDA1 START CORTE");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x0B:
                    console.log("SAIDA1 ON");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x0C:
                    console.log("SAIDA1 OFF");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x0D:
                    console.log("IN1 ON");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x0E:
                    console.log("IN2 ON");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x0F:
                    console.log("IN2 OFF");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x10:
                    console.log("POSIN ON");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x11:
                    console.log("POSIN OFF");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x26:
                    console.log("DESLOOCU SEM IGN");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x29:
                    console.log("IN1 OFF");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x2A:
                    console.log("SAIDA2 ON");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x2B:
                    console.log("SAIDA2 OFF");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x2C:
                    console.log("SAIDA2 START CORTE");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x3B:
                    console.log("SAIDA1 AUTO DESCORTE");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
                case 0x3C:
                    console.log("SAIDA2 AUTO DESCORTE");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
            
                default:
                    console.log("unknown packet");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
            }
        }
        else{
            switch (packetType) {
                case 0x01:
                    if(onePacketLength != 38) {
                        return false
                    }
                    console.log("System info");
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                    parseLogin(bufferOnlyPackets);
                break;

                case 0x02:
                case 0x03:
                case 0x04:
                case 0x07:
                case 0x08:
                case 0x0A:
                case 0x0B:
                case 0x0C:
                case 0x0D:
                case 0x0E:
                case 0x0F:
                case 0x10:
                case 0x11:
                case 0x26:
                case 0x29:
                case 0x2A:
                case 0x2B:
                case 0x2C:
                case 0x3B:
                case 0x3C:
                    if(onePacketLength != 59) {
                        return false;
                    }
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                    parseLocation(bufferOnlyPackets);
                break;
            
                default:
                    console.log("unknown packet");
                    console.log("Packet type: " + packetType.toString(16).toUpperCase());
                    console.log("Packet size: " + onePacketLength);
                    console.log("Mini Packet: " + bufferOnlyPackets.toString('hex').toUpperCase());
                break;
            }
        }
        bufferOnlyPackets = bufferOnlyPackets.slice(onePacketLength + 2);
    }
});

server.on('listening', () => {
    const address = server.address();
    console.log(`Server listening in: ${address.address}:${address.port}`);
});

server.bind(port, adress);