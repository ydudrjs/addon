/**
 * RS485 Homegateway for Bestin Homenet
 * @소스 공개 : Daehwan, Kang
 * @베스틴 홈넷용으로 수정 : harwin
 * @수정일 2022-09-10
 */

const util = require('util');
const net = require('net');
const SerialPort = require('serialport').SerialPort;
const mqtt = require('mqtt');

const CONFIG = require('/data/options.json');

const rs485_energy_config = {
    type: CONFIG.energy_config.type, //'socket' , 'serial'
    portName: process.platform.startsWith('win') ? "COM?" : CONFIG.energy_config.serial_port,
    baudrate: CONFIG.energy_config.baudrate,
    parity: CONFIG.energy_config.parity,
    socket_port: CONFIG.energy_config.socket_port,
    socket_ip: CONFIG.energy_config.socket_ip
};

const rs485_control_config = {
    type: CONFIG.control_config.type, //'socket' , 'serial'
    portName: process.platform.startsWith('win') ? "COM?" : CONFIG.control_config.serial_port,
    baudrate: CONFIG.control_config.baudrate,
    parity: CONFIG.control_config.parity,
    socket_port: CONFIG.control_config.socket_port,
    socket_ip: CONFIG.control_config.socket_ip
};

const mqtt_config = {
    broker: 'mqtt://' + CONFIG.mqtt.broker,
    port: CONFIG.mqtt.port,
    username: CONFIG.mqtt.username,
    password: CONFIG.mqtt.password,
    clientId: CONFIG.model + '-homenet',
    state_topic: 'homenet/%s%s/%s/state',
    device_topic: 'homenet/+/+/command'
};

const CONST = {
    // SerialPort 전송 Delay(ms)
    sendDelay: CONFIG.sendDelay,
    // MQTT 수신 Delay(ms)
    mqttDelay: CONFIG.mqtt.mqttDelay,
    // 메시지 Prefix 상수
    MSG_PREFIX: [0x02],

    // 기기별 상태 및 제어 코드(HEX)
    DEVICE_COMMAND: [
        { deviceId: 'Light', subId: '1', commandHex: Buffer.alloc(13, '02310d01d701010000000000f5', 'hex'), power1: 'OFF' },
        { deviceId: 'Light', subId: '1', commandHex: Buffer.alloc(13, '02310d01d00181000000000476', 'hex'), power1: 'ON' },
        { deviceId: 'Light', subId: '1', commandHex: Buffer.alloc(13, '02310d015f010200000000006a', 'hex'), power2: 'OFF' },
        { deviceId: 'Light', subId: '1', commandHex: Buffer.alloc(13, '02310d015801820000000004e9', 'hex'), power2: 'ON' },
        { deviceId: 'Light', subId: '1', commandHex: Buffer.alloc(13, '02310d0163010400000000006c', 'hex'), power3: 'OFF' },
        { deviceId: 'Light', subId: '1', commandHex: Buffer.alloc(13, '02310d015c01840000000004ef', 'hex'), power3: 'ON' },   //방1
        { deviceId: 'Light', subId: '2', commandHex: Buffer.alloc(13, '02310d019302010000000000b8', 'hex'), power1: 'OFF' },
        { deviceId: 'Light', subId: '2', commandHex: Buffer.alloc(13, '02310d018c028100000000043f', 'hex'), power1: 'ON' },
        { deviceId: 'Light', subId: '2', commandHex: Buffer.alloc(13, '02310d018402020000000000c4', 'hex'), power2: 'OFF' },
        { deviceId: 'Light', subId: '2', commandHex: Buffer.alloc(13, '02310d017b02820000000004cb', 'hex'), power2: 'ON' },   //방2
        { deviceId: 'Light', subId: '3', commandHex: Buffer.alloc(13, '02310d0143030100000000008b', 'hex'), power1: 'OFF' },
        { deviceId: 'Light', subId: '3', commandHex: Buffer.alloc(13, '02310d013b0381000000000497', 'hex'), power1: 'ON' },
        { deviceId: 'Light', subId: '3', commandHex: Buffer.alloc(13, '02310d017e0302000000000049', 'hex'), power2: 'OFF' },
        { deviceId: 'Light', subId: '3', commandHex: Buffer.alloc(13, '02310d017603820000000004d5', 'hex'), power2: 'ON' },   //방3
        { deviceId: 'Light', subId: '4', commandHex: Buffer.alloc(13, '02310d01c40401000000000005', 'hex'), power1: 'OFF' },
        { deviceId: 'Light', subId: '4', commandHex: Buffer.alloc(13, '02310d0191048100000000042c', 'hex'), power1: 'ON' },
        { deviceId: 'Light', subId: '4', commandHex: Buffer.alloc(13, '02310d0103040200000000004d', 'hex'), power2: 'OFF' },
        { deviceId: 'Light', subId: '4', commandHex: Buffer.alloc(13, '02310d01fe048200000000044c', 'hex'), power2: 'ON' },   //방4
        { deviceId: 'Light', subId: '5', commandHex: Buffer.alloc(13, '02310d017f0501000000000049', 'hex'), power1: 'OFF' },
        { deviceId: 'Light', subId: '5', commandHex: Buffer.alloc(13, '02310d017005810000000004ca', 'hex'), power1: 'ON' },
        { deviceId: 'Light', subId: '5', commandHex: Buffer.alloc(13, '02310d018a05020000000000b7', 'hex'), power2: 'OFF' },
        { deviceId: 'Light', subId: '5', commandHex: Buffer.alloc(13, '02310d01840582000000000441', 'hex'), power2: 'ON' },   //방5

        { deviceId: 'Outlet', subId: '1', commandHex: Buffer.alloc(13, '02310D01D801000100000000EC', 'hex'), power1: 'OFF' },
        { deviceId: 'Outlet', subId: '1', commandHex: Buffer.alloc(13, '02310D01FC010081000000094F', 'hex'), power1: 'ON' },
        { deviceId: 'Outlet', subId: '1', commandHex: Buffer.alloc(13, '02310D010A010002000000003F', 'hex'), power2: 'OFF' },
        { deviceId: 'Outlet', subId: '1', commandHex: Buffer.alloc(13, '02310D01D50100820000001262', 'hex'), power2: 'ON' },   //방1
        { deviceId: 'Outlet', subId: '2', commandHex: Buffer.alloc(13, '02310D01050200010000000040', 'hex'), power1: 'OFF' },
        { deviceId: 'Outlet', subId: '2', commandHex: Buffer.alloc(13, '02310D01B30200810000000911', 'hex'), power1: 'ON' },
        { deviceId: 'Outlet', subId: '2', commandHex: Buffer.alloc(13, '02310D018102000200000000C1', 'hex'), power2: 'OFF' },
        { deviceId: 'Outlet', subId: '2', commandHex: Buffer.alloc(13, '02310D016502008200000012CF', 'hex'), power2: 'ON' },   //방2
        { deviceId: 'Outlet', subId: '3', commandHex: Buffer.alloc(13, '02310D01440300010000000082', 'hex'), power1: 'OFF' },
        { deviceId: 'Outlet', subId: '3', commandHex: Buffer.alloc(13, '02310D01B1030081000000091C', 'hex'), power1: 'ON' },
        { deviceId: 'Outlet', subId: '3', commandHex: Buffer.alloc(13, '02310D016E0300020000000055', 'hex'), power2: 'OFF' },
        { deviceId: 'Outlet', subId: '3', commandHex: Buffer.alloc(13, '02310D01E8030082000000124D', 'hex'), power2: 'ON' },   //방3
        { deviceId: 'Outlet', subId: '4', commandHex: Buffer.alloc(13, '02310D01220400010000000021', 'hex'), power1: 'OFF' },
        { deviceId: 'Outlet', subId: '4', commandHex: Buffer.alloc(13, '02310D011A04008100000009A2', 'hex'), power1: 'ON' },
        { deviceId: 'Outlet', subId: '4', commandHex: Buffer.alloc(13, '02310D011B0400020000000031', 'hex'), power2: 'OFF' },
        { deviceId: 'Outlet', subId: '4', commandHex: Buffer.alloc(13, '02310D011304008200000012AB', 'hex'), power2: 'ON' },   //방4
        { deviceId: 'Outlet', subId: '5', commandHex: Buffer.alloc(13, '02310D01D805000100000000E8', 'hex'), power1: 'OFF' },
        { deviceId: 'Outlet', subId: '5', commandHex: Buffer.alloc(13, '02310D01D4050081000000097B', 'hex'), power1: 'ON' },
        { deviceId: 'Outlet', subId: '5', commandHex: Buffer.alloc(13, '02310D01E205000200000000E3', 'hex'), power2: 'OFF' },
        { deviceId: 'Outlet', subId: '5', commandHex: Buffer.alloc(13, '02310D01E60500820000001275', 'hex'), power2: 'ON' },   //방5
        ///////////// Energy Command       

        { deviceId: 'Fan', subId: '1', commandHex: Buffer.alloc(10, '0261014c00000100002f', 'hex'), power: 'OFF' }, //꺼짐
        { deviceId: 'Fan', subId: '1', commandHex: Buffer.alloc(10, '026101e3000101000089', 'hex'), power: 'ON' }, //켜짐
        { deviceId: 'Fan', subId: '1', commandHex: Buffer.alloc(10, '026103eb00000100008a', 'hex'), speed: 'low' }, //약(켜짐)
        { deviceId: 'Fan', subId: '1', commandHex: Buffer.alloc(10, '02610394000002000000', 'hex'), speed: 'medium' }, //중(켜짐)
        { deviceId: 'Fan', subId: '1', commandHex: Buffer.alloc(10, '0261039f0000030000fc', 'hex'), speed: 'high' }, //강(켜짐)

        { deviceId: 'Thermo', subId: '1', commandHex: Buffer.alloc(14, '02280e12e90101000000000000e3', 'hex'), power: 'heat' }, // 온도조절기1-on
        { deviceId: 'Thermo', subId: '1', commandHex: Buffer.alloc(14, '02280e12f70102000000000000c8', 'hex'), power: 'off' }, // 온도조절기1-off
        { deviceId: 'Thermo', subId: '2', commandHex: Buffer.alloc(14, '02280e12d30201000000000000ee', 'hex'), power: 'heat' },
        { deviceId: 'Thermo', subId: '2', commandHex: Buffer.alloc(14, '02280e12dd0202000000000000f5', 'hex'), power: 'off' },
        { deviceId: 'Thermo', subId: '3', commandHex: Buffer.alloc(14, '02280e127e030100000000000058', 'hex'), power: 'heat' },
        { deviceId: 'Thermo', subId: '3', commandHex: Buffer.alloc(14, '02280e12870302000000000000ba', 'hex'), power: 'off' },
        { deviceId: 'Thermo', subId: '4', commandHex: Buffer.alloc(14, '02280e12b8040100000000000091', 'hex'), power: 'heat' },
        { deviceId: 'Thermo', subId: '4', commandHex: Buffer.alloc(14, '02280e12c10402000000000000f7', 'hex'), power: 'off' },
        { deviceId: 'Thermo', subId: '5', commandHex: Buffer.alloc(14, '02280e12cc050100000000000008', 'hex'), power: 'heat' },
        { deviceId: 'Thermo', subId: '5', commandHex: Buffer.alloc(14, '02280e12be05020000000000008f', 'hex'), power: 'off' },
        { deviceId: 'Thermo', subId: '1', commandHex: Buffer.alloc(14, '', 'hex'), setTemp: '' }, // 온도조절기1-온도설정
        { deviceId: 'Thermo', subId: '2', commandHex: Buffer.alloc(14, '', 'hex'), setTemp: '' },
        { deviceId: 'Thermo', subId: '3', commandHex: Buffer.alloc(14, '', 'hex'), setTemp: '' },
        { deviceId: 'Thermo', subId: '4', commandHex: Buffer.alloc(14, '', 'hex'), setTemp: '' },
        { deviceId: 'Thermo', subId: '5', commandHex: Buffer.alloc(14, '', 'hex'), setTemp: '' },

        { deviceId: 'Gas', subId: '1', commandHex: Buffer.alloc(10, '0231023c000000000011', 'hex'), power: 'OFF' },
    ],                    

    // 상태 Topic (/homenet/${deviceId}${subId}/${property}/state/ = ${value})
    // 명령어 Topic (/homenet/${deviceId}${subId}/${property}/command/ = ${value})
    TOPIC_PRFIX: mqtt_config.topic_prefix,
    STATE_TOPIC: mqtt_config.state_topic,
    DEVICE_TOPIC: mqtt_config.device_topic,
};

//////////////////////////////////////////////////////////////////////////////////////
// 베스틴 홈넷용 시리얼 통신 파서 : 메시지 길이나 구분자가 불규칙하여 별도 파서 정의
var Transform = require('stream').Transform;
util.inherits(CustomParser, Transform);

function CustomParser(options) {
    if (!(this instanceof CustomParser))
        return new CustomParser(options);
    Transform.call(this, options);
    this._queueChunk = [];
    this._msgLenCount = 0;
    this._msgLength = 30;
    this._msgTypeFlag = false;
}

CustomParser.prototype._transform = function (chunk, encoding, done) {
    var start = 0;
    for (var i = 0; i < chunk.length; i++) {
        if (CONST.MSG_PREFIX.includes(chunk[i])) {			// 청크에 구분자(MSG_PREFIX)가 있으면
            this._queueChunk.push(chunk.slice(start, i));	// 구분자 앞부분을 큐에 저장하고
            this.push(Buffer.concat(this._queueChunk));	// 큐에 저장된 메시지들 합쳐서 내보냄
            this._queueChunk = [];	// 큐 초기화
            this._msgLenCount = 0;
            start = i;
            this._msgTypeFlag = true;	// 다음 바이트는 메시지 종류
        }
        // 메시지 종류에 따른 메시지 길이 파악
        else if (this._msgTypeFlag) {
            switch (chunk[i]) {
                case 0x28: case 0x0e:    //난방(command)
                    this._msgLength = 14; break;
                case 0x28: case 0x10:     //난방(ack)
                    this._msgLength = 16; break;
                case 0x61: case 0x80: case 0x81: case 0x83: case 0x01: case 0x03:     //환기(command, ack)
                    this._msgLength = 10; break;
                case 0x31: case 0x80:     //가스벨브(command, ack)
                    this._msgLength = 10; break;
                case 0x31: case 0x1e:     //조명,콘센트(ack)
                    this._msgLength = 30; break;
                case 0x31: case 0x0d:     //조명,콘센트(command)
                    this._msgLength = 13; break;
                default:
                    this._msgLength = 30;
            }
            this._msgTypeFlag = false;
        }
        this._msgLenCount++;
    }
    // 구분자가 없거나 구분자 뒷부분 남은 메시지 큐에 저장
    this._queueChunk.push(chunk.slice(start));

    // 메시지 길이를 확인하여 다 받았으면 내보냄
    if (this._msgLenCount >= this._msgLength) {
        this.push(Buffer.concat(this._queueChunk));	// 큐에 저장된 메시지들 합쳐서 내보냄
        this._queueChunk = [];	// 큐 초기화
        this._msgLenCount = 0;
    }

    done();
};
//////////////////////////////////////////////////////////////////////////////////////

// 로그 표시 
var log = (...args) => console.log('[' + new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ']', args.join(' '));

//////////////////////////////////////////////////////////////////////////////////////
// 홈컨트롤 상태
var homeStatus = {};
var lastReceive = new Date().getTime();
var mqttReady = false;
var queue = new Array();
//var queueSent = new Array();

//////////////////////////////////////////////////////////////////////////////////////
// MQTT-Broker 연결 (수정필요)
const client = mqtt.connect(mqtt_config.broker, {
    port: mqtt_config.port,
    username: mqtt_config.username,
    password: mqtt_config.password,
    clientId: mqtt_config.clientId
});
client.on('connect', () => {
    log("MQTT Connected! (", mqtt_config.broker, ")");
    client.subscribe(CONST.DEVICE_TOPIC, (err) => { if (err) log('MQTT Subscribe fail! -', CONST.DEVICE_TOPIC) });
});
client.on('error', err => {
    log("Error occurred: " + err);
    if (err.code == "ENOTFOUND") {
        console.log("Network error, make sure mqtt broker is enabled")
    }
});
client.on("offline", () => {
    log("Currently offline. Please check mqtt broker!");
});
client.on("reconnect", () => {
    log("Reconnection starting...");
});

//////////////////////////////////////////////////////////////////////////////////////
////////// Energy
if (rs485_energy_config.portType == 'serial') {

    log('Initializing:'+ rs485_energy_config.type);
    rs485_energy = new SerialPort({
        path: rs485_energy_config.portName,
        baudRate: rs485_energy_config.baudrate,
        dataBits: 8,
        parity: rs485_energy_config.parity,
        stopBits: 1,
        autoOpen: false,
        encoding: 'hex'
    });
    energy = rs485_energy.pipe(new CustomParser());
    rs485_energy.on('open', () => log('[Serial] Success open energy port:', rs485_energy_config.portName));
    rs485_energy.on('close', () => log('[Serial] Close energy port:', rs485_energy_config.portName));
    rs485_energy.open((err) => {
        if (err) {
            return log('[Serial] Error opening energy port:', err.message);
        }
    });
}
else {
    rs485_energy = new net.Socket();
    rs485_energy.connect(rs485_energy_config.socket_port, rs485_energy_config.socket_ip, function () {
        log('[Socket] Success Connected to energy', "(", rs485_energy_config.socket_ip, ")");
    });
    energy = rs485_energy.pipe(new CustomParser());
};

//////////////////////////////////////////////////////////////////////////////////////
////////// Control 
if (rs485_control_config.portType == 'serial') {

    log('Initializing:'+ rs485_control_config.type);
    rs485_control = new SerialPort({
        path: rs485_control_config.portName,
        baudRate: rs485_control_config.baudrate,
        dataBits: 8,
        parity: rs485_control_config.parity,
        stopBits: 1,
        autoOpen: false,
        encoding: 'hex'
    });
    control = rs485_control.pipe(new CustomParser());
    rs485_control.on('open', () => log('[Serial] Success open control port:', rs485_config.portName));
    rs485_control.on('close', () => log('[Serial] Close control port:', rs485_config.portName));
    rs485_control.open((err) => {
        if (err) {
            return log('[Serial] Error opening control port:', err.message);
        }
    });
}
else {
    rs485_control = new net.Socket();
    rs485_control.connect(rs485_control_config.socket_port, rs485_control_config.socket_ip, function () {
        log('[Socket] Success Connected to control', "(", rs485_control_config.socket_ip, ")");
    });
    control = rs485_control.pipe(new CustomParser());
};

//////////////////////////////////////////////////////////////////////////////////////
// 홈넷에서 SerialPort로 상태 정보 수신
energy.on('data', function (data) {
    // console.log('Receive interval: ', (new Date().getTime())-lastReceive, 'ms ->', data.toString('hex'));
    lastReceive = new Date().getTime();

    if (data[0] != 0x02) return;
    switch (data[2]) {
        case 0x1e:  //조명 및 콘센트 전원 '명령응답'
            data.length == 30;
            const ack = Buffer.alloc(1);
            data.copy(ack, 0, 1, 2);
            var objFoundIdx = null;
            var objFoundIdx = queue.findIndex(obj => obj.commandHex0.includes(ack));
            if (objFoundIdx > -1) {
                log('[Serial] Success command:', data.toString('hex'));
                queue.splice(objFoundIdx, 1);
            }
            break;
    }
});

control.on('data', function (data) {
    // console.log('Receive interval: ', (new Date().getTime())-lastReceive, 'ms ->', data.toString('hex'));
    lastReceive = new Date().getTime();

    if (data[0] != 0x02) return;
    switch (data[1]) {
        case 0x31: case 0x61: case 0x28: //가스, 전열교환기, 난방
            if (data[2] == 0x81 || data[2] == 0x82 || data[2] == 0x83 || data[2] == 0x87) { //환기(ON,OFF), 가스, 환기(SPEED), 환기(자연) '명령응답'
                data.length == 10;
            } else {
                (data[2] == 0x10)
                data.length == 16;
            }
            const ack2 = Buffer.alloc(1);
            data.copy(ack2, 0, 1, 2);
            var objFoundIdx = null;
            var objFoundIdx = queue.findIndex(obj => obj.commandHex1.includes(ack2));
            if (objFoundIdx > -1) {
                log('[Serial] Success command:', data.toString('hex'));
                queue.splice(objFoundIdx, 1);
            }
            break;
    }
});

//////////////////////////////////////////////////////////////////////////////////////
// MQTT로 HA에 상태값 전송
var updateStatus = (obj) => {
    var arrStateName = Object.keys(obj);
    // 상태값이 아닌 항목들은 제외 [deviceId, subId, stateHex, commandHex, sentTime]
    const arrFilter = ['deviceId', 'subId', 'stateHex', 'commandHex', 'sentTime'];
    arrStateName = arrStateName.filter(stateName => !arrFilter.includes(stateName));

    // 상태값별 현재 상태 파악하여 변경되었으면 상태 반영 (MQTT publish)
    arrStateName.forEach(function (stateName) {
        // 상태값이 없거나 상태가 같으면 반영 중지
        var curStatus = homeStatus[obj.deviceId + obj.subId + stateName];
        if (obj[stateName] == null || obj[stateName] === curStatus) return;
        // 미리 상태 반영한 device의 상태 원복 방지
        if (queue.length > 0) {
            var found = queue.find(q => q.deviceId + q.subId === obj.deviceId + obj.subId && q[stateName] === curStatus);
            if (found != null) return;
        }
        // 상태 반영 (MQTT publish)
        homeStatus[obj.deviceId + obj.subId + stateName] = obj[stateName];
        var topic = util.format(CONST.STATE_TOPIC, obj.deviceId, obj.subId, stateName);
        client.publish(topic, obj[stateName], { retain: true });
        log('[MQTT] Send to HA:', topic, '->', obj[stateName]);
    });
}

//////////////////////////////////////////////////////////////////////////////////////
// HA에서 MQTT로 제어 명령 수신
client.on('message', (topic, message) => {
    if (mqttReady) {
        var topics = topic.split('/');
        var value = message.toString(); // message buffer이므로 string으로 변환
        var objFound = null;

        if (topics[0] === CONST.TOPIC_PRFIX) {
            // 온도설정 명령의 경우 모든 온도를 Hex로 정의해두기에는 많으므로 온도에 따른 시리얼 통신 메시지 생성
            if (topics[2] === 'setTemp') {
                objFound = CONST.DEVICE_COMMAND.find(obj => obj.deviceId + obj.subId === topics[1] && obj.hasOwnProperty('setTemp'));
                objFound.commandHex[3] = Number(value);
                objFound.setTemp = String(Number(value)); // 온도값은 소수점이하는 버림
                var xorSum = objFound.commandHex[0] ^ objFound.commandHex[1] ^ objFound.commandHex[2] ^ objFound.commandHex[3] ^ 0x00
                objFound.commandHex[7] = xorSum; // 마지막 Byte는 XOR SUM
            }
            // 다른 명령은 미리 정의해놓은 값을 매칭
            else {
                objFound = CONST.DEVICE_COMMAND.find(obj => obj.deviceId + obj.subId === topics[1] && obj[topics[2]] === value);
            }
        }

        if (objFound == null) {
            log('[MQTT] Receive Unknown Msg.: ', topic, ':', value);
            return;
        }

        // 현재 상태와 같으면 Skip
        if (value === homeStatus[objFound.deviceId + objFound.subId + objFound[topics[2]]]) {
            log('[MQTT] Receive & Skip: ', topic, ':', value);
        }
        // Serial메시지 제어명령 전송 & MQTT로 상태정보 전송
        else {
            log('[MQTT] Receive from HA:', topic, ':', value);
            // 최초 실행시 딜레이 없도록 sentTime을 현재시간 보다 sendDelay만큼 이전으로 설정
            objFound.sentTime = (new Date().getTime()) - CONST.sendDelay;
            queue.push(objFound);	// 실행 큐에 저장
            updateStatus(objFound); // 처리시간의 Delay때문에 미리 상태 반영
        }
    }
})

//////////////////////////////////////////////////////////////////////////////////////
// SerialPort로 제어 명령 전송

const commandProc = () => {
    // 큐에 처리할 메시지가 없으면 종료
    if (queue.length == 0) return;

    // 기존 홈넷 RS485 메시지와 충돌하지 않도록 Delay를 줌
    var delay = (new Date().getTime()) - lastReceive;
    if (delay < CONST.sendDelay) return;

    // 큐에서 제어 메시지 가져오기
    var obj = queue.shift();
    rs485_energy.write(obj.commandHex, (err) => { if (err) return log('[Serial] Send Error: ', err.message); });
    rs485_control.write(obj.commandHex, (err) => { if (err) return log('[Serial] Send Error: ', err.message); });
    lastReceive = new Date().getTime();
    obj.sentTime = lastReceive;	// 명령 전송시간 sentTime으로 저장
    log('[Serial] Send to Device:', obj.deviceId, obj.subId, '->', obj.state, '(' + delay + 'ms) ', obj.commandHex.toString('hex'));

    // 다시 큐에 저장하여 Ack 메시지 받을때까지 반복 실행
    queue.push(obj);
}

setTimeout(() => { mqttReady = true; log('MQTT Ready...') }, CONST.mqttDelay);
setInterval(commandProc, 20);
