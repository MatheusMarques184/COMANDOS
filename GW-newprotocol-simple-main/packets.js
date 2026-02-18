export async function parseLogin(bufferOnlyPackets) {
    const infoLogin = {
        eventDate: null,
        controlByte: null,
        trackerType: null,
        version: null,
        subVersion: null,
        RFIDversion: null,
        ICCID: null,
        quantityBoot: null,
        quantityConnection: null,
        debugVersion: null
    }

    const unixTimestamp = bufferOnlyPackets.readUInt32BE(2);
    infoLogin.eventDate = new Date(unixTimestamp * 1000);

    infoLogin.controlByte = bufferOnlyPackets.slice(6,7).readUInt8();

    infoLogin.trackerType = bufferOnlyPackets.slice(7,8).toString('ascii');

    infoLogin.version = bufferOnlyPackets.slice(8,9).readUInt8();

    infoLogin.subVersion = bufferOnlyPackets.slice(9,10).readUInt8();

    infoLogin.RFIDversion = bufferOnlyPackets.slice(10,11).readUInt8();

    infoLogin.ICCID = "89" + bufferOnlyPackets.slice(11,19).readBigUInt64BE().toString();

    infoLogin.quantityBoot = bufferOnlyPackets.slice(19,21).readUInt16BE();

    infoLogin.quantityConnection = bufferOnlyPackets.slice(21,22).readUInt8();

    infoLogin.debugVersion = bufferOnlyPackets.slice(22,24).readUInt16BE();

    const systemInfo = `TrackerType: ${infoLogin.trackerType} | Version: ${infoLogin.version} | Subversion: ${infoLogin.subVersion} | RFID Version: ${infoLogin.RFIDversion} | ICCID: ${infoLogin.ICCID} | Boot: ${infoLogin.quantityBoot} | Connections: ${infoLogin.quantityConnection} | Debug Version: ${infoLogin.debugVersion}`

    console.log(systemInfo);

    console.log("saving in DB...")
}

export async function parseLocation(bufferOnlyPackets) {
    const infoLocation = {
        eventDate: null,
        controlByte: null,
        latitude: null,
        longitude: null,
        hodometro: null,
        heading: null,
        maxSpeedInMeterSeconds: null,
        speedInMeterSeconds: null,
        status: null,
        driverID: null,
        internalBatt: null,
        externalBatt: null,
        temperature: null,
        quantitySat: null,
        gsmQuality: null,
        secondsMeter: null,
        hdop: null,
        mnc : null,
        lac: null,
        celID: null
    }

    const unixTimestamp = bufferOnlyPackets.readUInt32BE(2);
    infoLocation.eventDate = new Date(unixTimestamp * 1000);

    infoLocation.controlByte = bufferOnlyPackets.slice(6,7).readUInt8();

    const latitudeBytes = bufferOnlyPackets.slice(7,12);
    const paddedLatitude = Buffer.alloc(8);
    latitudeBytes.copy(paddedLatitude, 0, 0, 5); 
    infoLocation.latitude = paddedLatitude.readDoubleBE(0); 

    const longitudeBytes = bufferOnlyPackets.slice(12,17);
    const paddedLongitude = Buffer.alloc(8);
    longitudeBytes.copy(paddedLongitude, 0, 0, 5); 
    infoLocation.longitude = paddedLongitude.readDoubleBE(0); 


    const hodometro = bufferOnlyPackets.slice(17,21).readUInt32BE();
    infoLocation.hodometro = hodometro / 10;

    infoLocation.heading = bufferOnlyPackets.slice(21,23).readUInt16BE();
    
    let maxSpeedintegerPart = bufferOnlyPackets.slice(23,24).readUInt8();
    let maxSpeedDecimalPart = bufferOnlyPackets.slice(24,25).readUInt8();
    let maxSpeedInKmHour = (maxSpeedintegerPart + (maxSpeedDecimalPart / 100)) * 3.6;
    infoLocation.maxSpeedInMeterSeconds = (maxSpeedintegerPart + (maxSpeedDecimalPart / 100));

    let speedintegerPart = bufferOnlyPackets.slice(25,26).readUInt8();
    let speedDecimalPart = bufferOnlyPackets.slice(26,27).readUInt8();
    let speedInKmHour = (speedintegerPart + (speedDecimalPart / 100)) * 3.6;
    infoLocation.speedInMeterSeconds = (speedintegerPart + (speedDecimalPart / 100));

    const statusByte = bufferOnlyPackets.slice(27, 28).readUInt8(); // 1 = true para todos
    const status = {
        ignition: (statusByte & (1 << 0)) !== 0,
        negIn1: (statusByte & (1 << 1)) !== 0, 
        positiveIn1: (statusByte & (1 << 2)) !== 0,
        vinMonitor: (statusByte & (1 << 3)) !== 0,
        negIn2: (statusByte & (1 << 4)) !== 0, 
        saida1: (statusByte & (1 << 5)) !== 0, 
        saida2: (statusByte & (1 << 6)) !== 0  
    };

    infoLocation.status = status;

    infoLocation.driverID = bufferOnlyPackets.slice(28,32).readUInt32BE().toString()

    const internalBattIntegerPart = bufferOnlyPackets.slice(32,33).readUInt8();
    const internalBattDecimalPart = bufferOnlyPackets.slice(33,34).readUInt8();
    infoLocation.internalBatt = internalBattIntegerPart + (internalBattDecimalPart / 100);

    const externalBattIntegerPart = bufferOnlyPackets.slice(34,35).readUInt8();
    const externalBattDecimalPart = bufferOnlyPackets.slice(35,36).readUInt8();
    infoLocation.externalBatt = externalBattIntegerPart + (externalBattDecimalPart / 100);

    const temperatureIntegerPart = bufferOnlyPackets.slice(36,37).readInt8(0);
    const temperatureDecimalPart = bufferOnlyPackets.slice(37,38).readUInt8();
    
    if(temperatureIntegerPart >=0) infoLocation.temperature = temperatureIntegerPart + (temperatureDecimalPart / 100);
    else infoLocation.temperature = temperatureIntegerPart - (temperatureDecimalPart / 100);

    const quantitySat = bufferOnlyPackets.slice(42, 43).readUInt8();
    //infoLocation.quantitySat = byteValue & 0x0F;
    infoLocation.quantitySat = quantitySat;

    const gsmQuality  = bufferOnlyPackets.slice(43,44).readUInt8();
    infoLocation.gsmQuality = gsmQuality;

    const secondsMeter = bufferOnlyPackets.slice(44,48).readUInt32BE(); // Total accumulated seconds with ignition on (odometer-style counter)
    infoLocation.secondsMeter = secondsMeter;

    const MAX_HDOP_VALUE = 5;
    const MAX_BYTE_VALUE = 255;
    const hdopInBuffer  = bufferOnlyPackets.slice(48,49).readUInt8();
    const hdop = hdopInBuffer >= MAX_BYTE_VALUE ? MAX_HDOP_VALUE : Math.round((hdopInBuffer * MAX_HDOP_VALUE / MAX_BYTE_VALUE) * 100) / 100;
    infoLocation.hdop = hdop;

    const mnc  = bufferOnlyPackets.slice(49,50).readUInt8();
    infoLocation.mnc = mnc;

    const lac  = bufferOnlyPackets.slice(50,52).readUInt16BE();
    infoLocation.lac = lac;

    const celID  = bufferOnlyPackets.slice(52,56).readUInt32BE();
    infoLocation.celID = celID;

    //3 bytes, 0x000000, reserved

    console.log(infoLocation);

    console.log("saving in DB...");
}
