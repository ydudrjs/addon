/** 
 * @fileoverview bestin.js
 * @description bestin.js
 * @version 1.7.0
 * @license MIT
 * @author harwin1
 * @date 2023-02-12
 * @lastUpdate 2023-02-12
 */

const fs = require('fs');
const util = require('util');
const net = require('net');
const SerialPort = require('serialport').SerialPort;
const mqtt = require('mqtt');
const request = require('request');
const xml2js = require('xml2js');

// 커스텀 파서
const Transform = require('stream').Transform;
const CONFIG = require('/data/options.json');

// 로그 표시 
const log = (...args) => console.log('[' + (new Date()).toLocaleString() + ']', 'INFO     ', args.join(' '));
const warn = (...args) => console.log('[' + (new Date()).toLocaleString() + ']', 'WARNING  ', args.join(' '));
const error = (...args) => console.error('[' + (new Date()).toLocaleString() + ']', 'ERROR    ', args.join(' '));

const MSG_INFO = [
    /////////////////////////////////////////////////////////////////////////////
    //command <-> response
    {
        device: 'light', header: 0x31, command: 0x01, length: 13, request: 'set',
        setPropertyToMsg: (b, i, n, v) => {
            let id = n.slice(5, 6), val = (v == 'on' ? 0x80 : 0x00), on = (v == 'on' ? 0x04 : 0x00);
            b[5] = i & 0x0F;
            if (n.includes('power')) b[6] = ((0x01 << id) | val), b[11] = on;
            else if (n == 'batch') b[6] = (v == 'on' ? 0x8F : 0x0F), b[11] = on;
            return b;
        }
    },
    { device: 'light', header: 0x31, command: 0x81, length: 30, request: 'ack', },

    {
        device: 'outlet', header: 0x31, command: 0x01, length: 13, request: 'set',
        setPropertyToMsg: (b, i, n, v) => {
            let id = n.slice(5, 6), val = (v == 'on' ? 0x80 : 0x00), on = (v == 'on' ? (0x09 << id) : 0x00);
            b[5] = i & 0x0F;
            if (n.includes('power')) b[7] = ((0x01 << id) | val), b[11] = on;
            else if (n == 'standby') b[8] = (v == 'on' ? 0x83 : 0x03);
            else if (n == 'batch') b[7] = (v == 'on' ? 0x8F : 0x0F), b[11] = on;
            return b;
        }
    },
    { device: 'outlet', header: 0x31, command: 0x81, length: 30, request: 'ack', },

    {
        device: 'thermostat', header: 0x28, command: 0x12, length: 14, request: 'set',
        setPropertyToMsg: (b, i, n, v) => {
            b[5] = i & 0x0F, b[6] = (v == 'heat' ? 0x01 : 0x02);
            return b;
        }
    },
    { device: 'thermostat', header: 0x28, command: 0x92, length: 16, request: 'ack', },

    {
        device: 'thermostat', header: 0x28, command: 0x12, length: 14, request: 'set',
        setPropertyToMsg: (b, i, n, v) => {
            b[5] = i & 0x0F, val = parseFloat(v), vInt = parseInt(val), vFloat = val - vInt;
            b[7] = ((vInt & 0xFF) | ((vFloat != 0) ? 0x40 : 0x00));
            return b;
        }
    },
    { device: 'thermostat', header: 0x28, command: 0x92, length: 16, request: 'ack', },

    {
        device: 'ventil', header: 0x61, length: 10, request: 'set',
        setPropertyToMsg: (b, i, n, v) => {
            if (n == 'power') b[2] = 0x01, b[5] = (v == 'on' ? 0x01 : 0x00), b[6] = 0x01;
            else if (n == 'speed') b[2] = 0x03, b[6] = Number(v);
            return b;
        }
    },
    { device: 'ventil', header: 0x61, command: 0x81, length: 10, request: 'ack', },

    {
        device: 'gas', header: 0x31, command: 0x02, length: 10, request: 'set',
        setPropertyToMsg: (b, i, n, v) => { return b; }
    },
    { device: 'gas', header: 0x31, command: 0x82, length: 10, request: 'ack', },

    /////////////////////////////////////////////////////////////////////////////
    //query <-> response
    {
        device: 'light', header: 0x31, command: 0x11, length: 7, request: 'get',
        setPropertyToMsg: (b, i, n, v) => { b[5] = i; return b; }
    },
    {
        device: 'light', header: 0x31, command: 0x91, length: 30, request: 'ack',
        parseToProperty: (b) => {
            var propArr = []; let m = (b[6].toString(16).slice(0, 1) == 'c' ? 4 : 3); let num = (b[5] & 0x0F) == 1 ? m : 2;
            for (let i = 0; i < num; i++) {
                propArr.push({
                    device: 'light', roomIdx: b[5] & 0x0F, propertyName: 'power' + i,
                    propertyValue: ((b[6] & (1 << i)) ? 'on' : 'off'),
                },
                    {
                        device: 'light', roomIdx: b[5] & 0x0F, propertyName: 'batch',
                        propertyValue: ((b[6] & 0x0F) ? 'on' : 'off'),
                    });
            }
            return propArr;
        }
    },

    {
        device: 'outlet', header: 0x31, command: 0x11, length: 7, request: 'get',
        setPropertyToMsg: (b, i, n, v) => { b[5] = i; return b; }
    },
    {
        device: 'outlet', header: 0x31, command: 0x91, length: 30, request: 'ack',
        parseToProperty: (b) => {
            var propArr = []; let num = (b[5] & 0x0F) == 1 ? 3 : 2;
            for (let i = 0; i < num; i++) {
                consumption = b.length > (i1 = 14 + 2 * i) + 2 ? parseInt(b.slice(i1, i1 + 2).toString('hex'), 16) / 10 : 0;
                propArr.push({
                    device: 'outlet', roomIdx: b[5] & 0x0F, propertyName: 'power' + i,
                    propertyValue: ((b[7] & (1 << i)) ? 'on' : 'off'),
                },
                    {
                        device: 'outlet', roomIdx: b[5] & 0x0F, propertyName: 'usage' + i,
                        propertyValue: consumption,
                    },
                    {
                        device: 'outlet', roomIdx: b[5] & 0x0F, propertyName: 'standby',
                        propertyValue: ((b[7] >> 4 & 1) ? 'on' : 'off'),
                    },
                    {
                        device: 'outlet', roomIdx: b[5] & 0x0F, propertyName: 'batch',
                        propertyValue: ((b[7] & 0x0F) ? 'on' : 'off'),
                    });
            }
            return propArr;
        }
    },

    {
        device: 'thermostat', header: 0x28, command: 0x11, length: 7, request: 'get',
        setPropertyToMsg: (b, i, n, v) => { b[5] = i; return b; }
    },
    {
        device: 'thermostat', header: 0x28, command: 0x91, length: 16, request: 'ack',
        parseToProperty: (b) => {
            return [
                { device: 'thermostat', roomIdx: b[5] & 0x0F, propertyName: 'mode', propertyValue: (b[6] & 0x01) ? 'heat' : 'off' },
                { device: 'thermostat', roomIdx: b[5] & 0x0F, propertyName: 'setting', propertyValue: (b[7] & 0x3F) + ((b[7] & 0x40) > 0) * 0.5 },
                { device: 'thermostat', roomIdx: b[5] & 0x0F, propertyName: 'current', propertyValue: (b[8] << 8) + b[9] / 10.0 },
            ];
        }
    },

    {
        device: 'ventil', header: 0x61, command: 0x00, length: 10, request: 'get',
        setPropertyToMsg: (b, i, n, v) => { return b; }
    },
    {
        device: 'ventil', header: 0x61, command: 0x80, length: 10, request: 'ack',
        parseToProperty: (b) => {
            return [
                { device: 'ventil', roomIdx: 1, propertyName: 'power', propertyValue: (b[5] ? 'on' : 'off') },
                { device: 'ventil', roomIdx: 1, propertyName: 'preset', propertyValue: b[6].toString().padStart(2, '0') },
            ];
        }
    },

    {
        device: 'gas', header: 0x31, command: 0x00, length: 10, request: 'get',
        setPropertyToMsg: (b, i, n, v) => { return b; }
    },
    {
        device: 'gas', header: 0x31, command: 0x80, length: 10, request: 'ack',
        parseToProperty: (b) => {
            return [{ device: 'gas', roomIdx: 1, propertyName: 'power', propertyValue: (b[5] ? 'on' : 'off') }];
        }
    },

    {
        device: 'energy', header: 0xD1, command: 0x02, length: 7, request: 'get',
        setPropertyToMsg: (b, i, n, v) => { return b; }
    },
    {
        device: 'energy', header: 0xD1, command: 0x82, length: 48, request: 'ack',
        parseToProperty: (b) => {
            var propArr = [];
            let idx = 13; // 13번째 바이트부터 소비량이 들어있음
            for (let name of ['elec', 'heat', 'hwater', 'gas', 'water']) {
                consumption = b.slice(idx, idx + 2).toString('hex');
                propArr.push({ device: 'energy', roomIdx: name, propertyName: 'current', propertyValue: consumption });
                idx += 8;
            }
            return propArr;
        }
    },
]

class CustomParser extends Transform {
    constructor(options) {
        super(options);
        this.reset();
    }

    reset() {
        this._queueChunk = [];
        this._msgLenCount = 0;
        this._msgLength = undefined;
        this._msgTypeFlag = false;  // 다음 바이트는 메시지 종류
        this._msgPrefix = [0x02];
        this._msgHeader = [0x31, 0x41, 0x42, 0xD1, 0x28, 0x61];
    }

    _transform(chunk, encoding, done) {
        let start = 0;
        for (let i = 0; i < chunk.length; i++) {
            if (this._msgPrefix.includes(chunk[i]) && this._msgHeader.includes(chunk[i + 1])) {
                // 앞 prefix                                                   // 두번째 바이트
                this.pushBuffer();
                start = i;
                this._msgTypeFlag = true;
            } else if (this._msgTypeFlag) {
                this._msgLength = chunk[i + 1] + 1;
                this._msgTypeFlag = false;
                if (!this._msgLength === chunk[i + 1] + 1) {
                    // 모든 packet의 3번째 바이트는 그 패킷의 전체 길이의 나타냄
                    this.reset();
                    return done(new Error('Invalid message length'));
                    // 패킷 길의 검증
                }
            }

            if (this._msgLenCount === this._msgLength - 1) {
                this.pushBuffer();
                start = i;
            } else {
                this._msgLenCount++;
            }
        }
        this._queueChunk.push(chunk.slice(start));
        done();
    }

    pushBuffer() {
        this.push(Buffer.concat(this._queueChunk));  // 큐에 저장된 메시지들 합쳐서 내보냄
        this.reset();
    }
}

class _HOMERS485 {
    constructor() {
        this._serverStartTime = new Date();
        this._receivedMsgs = [];
        this._deviceReady = false;
        this._syncTime = new Date();
        this._lastReceive = new Date();
        this._commandQueue = new Array();
        this._serialCmdQueue = new Array();
        this._deviceStatusCache = {};
        this._deviceStatus = [];
        this._timestamp = undefined;

        this._mqttClient = this.mqttClient();
        this._discoveryRegist = false;
        this._socketWriteEnergy = this.createSocketConnection(CONFIG.energy_port, 'energy');
        this._socketWriteControl = this.createSocketConnection(CONFIG.control_port, 'control');
        if (CONFIG.rs485.ipark_server_enabled) {
            this._iparkServerInfo = this.IparkLoginRequest();
            this._cookieInfo = {};
        }
    }

    mqttClient() {
        const client = mqtt.connect(`mqtt://${CONFIG.mqtt.broker}`, {
            port: CONFIG.mqtt.port,
            username: CONFIG.mqtt.username,
            password: CONFIG.mqtt.password,
            clientId: 'BESTIN_WALLPAD',
        });

        client.on("connect", () => {
            log("MQTT connection successful!");
            this._deviceReady = true; // mqtt 연결 성공하면 장치 준비 완료
            const topics = ["bestin/+/+/+/command", "homeassistant/status"];
            topics.forEach(topic => {
                client.subscribe(topic, (err) => {
                    if (err) {
                        error(`failed to subscribe to ${topic}`);
                    }
                });
            });
        });

        client.on("error", (err) => {
            error(`MQTT connection error: ${err}`);
            this._deviceReady = false;
        });

        client.on("reconnect", () => {
            warn("MQTT connection lost. try to reconnect...");
        });
        log("initializing mqtt...");

        // ha에서 mqtt로 제어 명령 수신
        client.on("message", this.mqttCommand.bind(this));
        return client;
    }

    mqttCommand(topic, message) {
        if (!this._deviceReady) {
            warn("MQTT is not ready yet");
            return;
        }
        const topics = topic.split("/");
        const value = message.toString();
        const prefix = CONFIG.mqtt.topic_prefix;
        if (topics[0] !== prefix) {
            return;
        }

        if (topics[2] === "living") {
            const unitNum = topics[3].replace(/power/g, "switch");
            this.IparkLightCmdOptions(unitNum, value);
        } else {
            const [device, roomIdx, propertyName] = topics.slice(1, 4);
            this.setCommandProperty(device, roomIdx, propertyName, value);
        }
    }

    mqttClientUpdate(device, roomIdx, propertyName, propertyValue) {
        if (!this._deviceReady) {
            return;
        }
        const prefix = CONFIG.mqtt.topic_prefix;
        const topic = `${prefix}/${device}/${roomIdx}/${propertyName}/state`;

        if (!(propertyName.includes(["usage"]) || propertyName == "current")) {
            log("publish mqtt:", topic, "=", propertyValue);
        }
        this._mqttClient.publish(topic, String(propertyValue), { retain: true });
    }

    mqttRegistDiscover(device, roomIdx, Idx) {
        switch (device) {
            case 'light':
                var topic = `homeassistant/light/bestin_wallpad/light_${roomIdx}_${Idx}/config`;
                var payload = {
                    name: `bestin_light_${roomIdx}_${Idx}`,
                    cmd_t: `bestin/light/${roomIdx}/${Idx}/command`,
                    stat_t: `bestin/light/${roomIdx}/${Idx}/state`,
                    uniq_id: `bestin_light_${roomIdx}_${Idx}`,
                    pl_on: "on",
                    pl_off: "off",
                    device: {
                        ids: "bestin_wallpad",
                        name: "bestin_wallpad",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin-new",
                    }
                }
                break;
            case 'outlet':
                const component = Idx.includes("usage") ? "sensor" : "switch";
                var topic = `homeassistant/${component}/bestin_wallpad/outlet_${roomIdx}_${Idx}/config`;
                var payload = {
                    name: `bestin_outlet_${roomIdx}_${Idx}`,
                    cmd_t: `bestin/outlet/${roomIdx}/${Idx}/command`,
                    stat_t: `bestin/outlet/${roomIdx}/${Idx}/state`,
                    uniq_id: `bestin_outlet_${roomIdx}_${Idx}`,
                    pl_on: "on",
                    pl_off: "off",
                    ic: Idx.includes("usage") ? "mdi:lightning-bolt" : "mdi:power-socket-eu",
                    unit_of_meas: Idx.includes("usage") ? "Wh" : "",
                    device: {
                        ids: "bestin_wallpad",
                        name: "bestin_wallpad",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin-new",
                    }
                }
                break;
            case 'thermostat':
                var topic = `homeassistant/climate/bestin_wallpad/thermostat_${roomIdx}/config`;
                var payload = {
                    name: `bestin_thermostat_${roomIdx}`,
                    mode_cmd_t: `bestin/thermostat/${roomIdx}/mode/command`,
                    mode_stat_t: `bestin/thermostat/${roomIdx}/mode/state`,
                    temp_cmd_t: `bestin/thermostat/${roomIdx}/setting/command`,
                    temp_stat_t: `bestin/thermostat/${roomIdx}/setting/state`,
                    curr_temp_t: `bestin/thermostat/${roomIdx}/current/state`,
                    uniq_id: `bestin_thermostat_${roomIdx}`,
                    modes: ["off", "heat"],
                    min_temp: 5,
                    max_temp: 40,
                    temp_step: 0.1,
                    device: {
                        ids: "bestin_wallpad",
                        name: "bestin_wallpad",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin-new",
                    }
                }
                break;
            case 'ventil':
                var topic = `homeassistant/fan/bestin_wallpad/ventil_${roomIdx}/config`;
                var payload = {
                    name: `bestin_ventil_${roomIdx}`,
                    cmd_t: `bestin/ventil/${roomIdx}/power/command`,
                    stat_t: `bestin/ventil/${roomIdx}/power/state`,
                    pr_mode_cmd_t: `bestin/ventil/${roomIdx}/preset/command`,
                    pr_mode_stat_t: `bestin/ventil/${roomIdx}/preset/state`,
                    pr_modes: ["01", "02", "03"],
                    uniq_id: `bestin_vnetil_${roomIdx}`,
                    pl_on: "on",
                    pl_off: "off",
                    device: {
                        ids: "bestin_wallpad",
                        name: "bestin_wallpad",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin-new",
                    }
                }
                break;
            case 'gas':
                var topic = `homeassistant/switch/bestin_wallpad/gas_valve_${roomIdx}/config`;
                var payload = {
                    name: `bestin_gas_valve_${roomIdx}`,
                    cmd_t: `bestin/gas/${roomIdx}/power/command`,
                    stat_t: `bestin/gas/${roomIdx}/power/state`,
                    uniq_id: `bestin_gas_valve_${roomIdx}`,
                    pl_on: "on",
                    pl_off: "off",
                    ic: "mdi:gas-cylinder",
                    device: {
                        ids: "bestin_wallpad",
                        name: "bestin_wallpad",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin-new",
                    }
                }
                break;
            case 'energy':
                var topic = `homeassistant/sensor/bestin_wallpad/energy_${roomIdx}_${Idx}/config`;
                var payload = {
                    name: `bestin_energy_${roomIdx}_${Idx}_usage`,
                    stat_t: `bestin/energy/${roomIdx}/${Idx}/state`,
                    unit_of_meas: roomIdx == "elec" ? "kWh" : "m³",
                    uniq_id: `bestin_energy_${roomIdx}_${Idx}_usage`,
                    device: {
                        ids: "bestin_wallpad",
                        name: "bestin_wallpad",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin-new",
                    },
                };
                break;
            case 'vehicle':
                var topic = `homeassistant/sensor/bestin_wallpad/vehicle_${roomIdx}/config`;
                var payload = {
                    name: `bestin_vehicle_${roomIdx}`,
                    stat_t: `bestin/vehicle/${roomIdx}/info/state`,
                    uniq_id: `bestin_vehicle_${roomIdx}`,
                    ic: "mdi:car",
                    device: {
                        ids: "bestin_wallpad",
                        name: "bestin_wallpad",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin-new",
                    }
                }
                break;
            case 'delivery':
                var topic = `homeassistant/sensor/bestin_wallpad/delivery_${roomIdx}/config`;
                var payload = {
                    name: `bestin_delivery_${roomIdx}`,
                    stat_t: `bestin/delivery/${roomIdx}/info/state`,
                    uniq_id: `bestin_delivery_${roomIdx}`,
                    ic: "mdi:archive-check",
                    device: {
                        ids: "bestin_wallpad",
                        name: "bestin_wallpad",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin-new",
                    }
                }
                break;
        }
        setTimeout(() => {
            this._discoveryRegist = true;
        }, 10000);
        if (this._discoveryRegist) {
            return;
        }
        if (!this._discoveryRegist) {
            //log('Add new device: ', topic);
            this._mqttClient.publish(topic, JSON.stringify(payload), { retain: true });
        }
    }

    // 패킷 체크섬 검증
    verifyCheckSum(packet) {
        // 3으로 초기화
        let result = 0x03;
        for (let i = 0; i < packet.length; i++) {
            result ^= packet[i];
            result = (result + 1) & 0xFF;
            // 바이트를 순차적으로 xor 한뒤 +1 / 8비트로 truncation
        }
        return result;
    }

    // 명령 패킷 마지막 바이트(crc) 생성
    generateCheckSum(packet) {
        let result = 0x03;
        for (let i = 0; i < packet.length - 1; i++) {
            result ^= packet[i];
            result = (result + 1) & 0xFF;
        }
        return result;
    }

    createSocketConnection(options, name) {
        let connection;
        if (options.type === 'serial') {
            connection = new SerialPort({
                path: options.ser_path,
                baudRate: 9600,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                autoOpen: false,
                encoding: 'hex'
            });

            connection.pipe(new CustomParser()).on('data', this.packetHandle.bind(this));
            connection.on('open', () => {
                log(`successfully opened ${name} port: ${options.ser_path}`);
            });
            connection.on('close', () => {
                warn(`closed ${name} port: ${options.ser_path}`);
            });
            connection.open((err) => {
                if (err) {
                    error(`failed to open ${name} port: ${err.message}`);
                }
            });
        }
        else {
            connection = new net.Socket();
            connection.connect(options.port, options.address, () => {
                log(`successfully connected to ${name}  [${options.address}:${options.port}]`);
            });
            connection.on('error', (err) => {
                error(`connection error ${err.code}::${name.toUpperCase()}. try to reconnect...`);
                connection.connect(options.port, options.address);
                // 연결 애러 발생시 reconnect
            });
            connection.pipe(new CustomParser()).on('data', this.packetHandle.bind(this));
        }
        return connection;
    }

    packetHandle(packet) {
        this._lastReceive = new Date();
        if (packet[0] == 0x02 && packet[1] == 0x42) {
            this._syncTime = this._lastReceive;
            this._timestamp = packet[4];
        }

        const cmdHex = [packet[2], packet[3]];
        const receivedMsg = this._receivedMsgs.find(e => e.codeHex.equals(packet)) || {
            code: packet.toString('hex'),
            codeHex: packet,
            count: 0,
            info: MSG_INFO.filter(e => e.header == packet[1] && cmdHex.includes(e.command) && e.length == packet.length),
        };

        receivedMsg.checksum = this.verifyCheckSum(packet);
        receivedMsg.count++;
        receivedMsg.lastlastReceive = receivedMsg.lastReceive;
        receivedMsg.lastReceive = this._lastReceive;
        receivedMsg.timeslot = this._lastReceive - this._syncTime;

        if (!receivedMsg.info.every(Boolean)) {
            return;
        }

        const ackHex = [0x81, 0x82, 0x83, 0x92];
        const foundIdx = this._serialCmdQueue.findIndex(e => e.cmdHex[1] == packet[1] && ackHex.includes(receivedMsg.info[0]?.command));
        if (foundIdx > -1) {
            log(`Success command: ${this._serialCmdQueue[foundIdx].device}`);
            const { callback, device } = this._serialCmdQueue[foundIdx];
            if (callback) callback(receivedMsg);
            this._serialCmdQueue.splice(foundIdx, 1);
        }

        for (const msgInfo of receivedMsg.info) {
            if (msgInfo.parseToProperty) {
                const propArray = msgInfo.parseToProperty(packet);
                for (const { device, roomIdx, propertyName, propertyValue } of propArray) {
                    this.updateProperty(device, roomIdx, propertyName, propertyValue, foundIdx > -1);
                }
            }
        }
    }

    addCommandToQueue(cmdHex, device, roomIdx, propertyName, propertyValue, callback) {
        const serialCmd = {
            cmdHex,
            device,
            roomIdx,
            property: propertyName,
            value: propertyValue,
            callback,
            sentTime: new Date(),
            retryCount: CONFIG.rs485.retry_count
        };

        this._serialCmdQueue.push(serialCmd);
        log(`send to device: ${cmdHex.toString('hex')}`);

        const elapsed = serialCmd.sentTime - this._syncTime;
        const delay = (elapsed < 100) ? 100 - elapsed : 0;

        setTimeout(() => this.processCommand(serialCmd), delay);
    }

    processCommand(serialCmd) {
        if (this._serialCmdQueue.length == 0) {
            return;
        }
        serialCmd = this._serialCmdQueue.shift();

        const socketWrite = {
            light: this._socketWriteEnergy,
            outlet: this._socketWriteEnergy,
            ventil: this._socketWriteControl,
            gas: this._socketWriteControl,
            thermostat: this._socketWriteControl
        }[serialCmd.device];

        if (!socketWrite) {
            error(`Invalid device: ${serialCmd.device}`);
            return;
        }

        socketWrite.write(serialCmd.cmdHex, (err) => {
            if (err) {
                error('Send Error:', err.message);
            }
        });

        if (serialCmd.retryCount > 0) {
            serialCmd.retryCount--;
            this._serialCmdQueue.push(serialCmd);
            setTimeout(() => this.processCommand(serialCmd), CONFIG.rs485.retry_delay);
        } else {
            error(`maximum retries (${CONFIG.rs485.retry_count}) exceeded for command`);
            if (serialCmd.callback) {
                serialCmd.callback.call(this);
            }
        }
    }

    setCommandProperty(device, roomIdx, propertyName, propertyValue, callback) {
        const msgInfo = MSG_INFO.find(e => e.setPropertyToMsg && e.device === device);
        if (!msgInfo) {
            warn(`unknown device: ${device}`);
            return;
        }
        if (!msgInfo.device.includes(device)) {
            warn(`unknown command: ${propertyName}`);
            return;
        }
        if (!propertyValue) {
            warn(`no payload value: ${propertyValue}`);
            return;
        }

        const cmdHex = Buffer.alloc(msgInfo.length);
        cmdHex[0] = 0x02;
        cmdHex[1] = msgInfo.header;
        cmdHex[2] = msgInfo.length === 10 ? msgInfo.command : msgInfo.length;
        cmdHex[3] = msgInfo.length === 10 ? this._timestamp : msgInfo.command;
        msgInfo.setPropertyToMsg(cmdHex, roomIdx, propertyName, propertyValue);
        cmdHex[msgInfo.length - 1] = this.generateCheckSum(cmdHex);

        this.addCommandToQueue(cmdHex, device, roomIdx, propertyName, propertyValue, callback);
        this.updateProperty(device, roomIdx, propertyName, propertyValue);
    }

    putStatusProperty(device, roomIdx, property) {
        var deviceStatus = {
            device: device,
            roomIdx: roomIdx,
            property: (property ? property : {})
        };
        this._deviceStatus.push(deviceStatus);
        return deviceStatus;
    }

    updateProperty(device, roomIdx, propertyName, propertyValue, force) {
        const propertyKey = device + roomIdx + propertyName;
        const isSamePropertyValue = !force && this._deviceStatusCache[propertyKey] === propertyValue;
        if (isSamePropertyValue) return;

        const isPendingCommand = this._serialCmdQueue.some(e => e.device === device && e.roomIdx === roomIdx && e.property === propertyName && e.value === this._deviceStatusCache[propertyKey]);
        if (isPendingCommand) return;

        this._deviceStatusCache[propertyKey] = propertyValue;

        let deviceStatus = this._deviceStatus.find(o => o.device === device && o.roomIdx === roomIdx);
        if (!deviceStatus) {
            deviceStatus = this.putStatusProperty(device, roomIdx);
            //if (CONFIG.mqtt.discovery_register) { this.MqttDiscovery(device, roomIdx, propertyName) };
        }
        deviceStatus.property[propertyName] = propertyValue;

        this.mqttClientUpdate(device, roomIdx, propertyName, propertyValue);
        if (CONFIG.mqtt.discovery_register) { this.mqttRegistDiscover(device, roomIdx, propertyName) };
    }

    IparkLoginRequest() {
        const that = this;
        const address = `http://${CONFIG.ipark_server.address}/webapp/data/getLoginWebApp.php?devce=WA&login_ide=${CONFIG.ipark_server.username}&login_pwd=${CONFIG.ipark_server.password}`
        request.get(address, (error, response) => {
            if (!error && response.statusCode === 200) {
                log('I-PARK server login successful');
                that.CookieInfo(response);
            } else {
                warn(`I-PARK server login falied with error code: ${error}`);
                return;
            }
        })
    }

    CookieInfo(response) {
        const cookies = response.headers['set-cookie'];
        const cookieMap = cookies.reduce((acc, cookie) => {
            const [key, value] = cookie.split('=');
            acc[key] = value.split(';')[0];
            return acc;
        }, {});

        const cookieJson = {
            phpsessid: cookieMap['PHPSESSID'],
            userid: cookieMap['user_id'],
            username: cookieMap['user_name'],
        };
        this._cookieInfo = cookieJson;

        if (!this._cookieInfo) {
            error('unable to assign parsed login cookie information to cookieInfo from server.');
            return;
        }
        log(`Success. login cookie information: ${JSON.stringify(this._cookieInfo)}`);

        const functionsToCall = [];
        for (const [deviceName, deviceBool] of Object.entries(CONFIG.ipark_server_device)) {
            if (deviceBool === true) {
                switch (deviceName) {
                    case 'living_light':
                        functionsToCall.push(this.IparkLightStatusOptions);
                        break;
                    case 'vehicle':
                        functionsToCall.push(this.IparkVehicleStatusOptions);
                        break;
                    case 'delivery':
                        functionsToCall.push(this.IparkDeliveryStatusOptions);
                        break;
                    case 'energy':
                        functionsToCall.push(this.IparkEnergyStatusOptions);
                        break;
                }
            }
            log(`I-Park server selected devices: ${deviceName}::${deviceBool}`);
        }

        functionsToCall.forEach((func) => func.call(this));
        setInterval(() => functionsToCall.forEach((func) => func.call(this)), CONFIG.rs485.ipark_server_scan * 1000);
    }

    IparkLightStatusOptions() {
        const options = {
            url: `http://${CONFIG.ipark_server.address}/webapp/data/getHomeDevice.php`,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': `PHPSESSID=${this._cookieInfo.phpsessid}; user_id=${this._cookieInfo.userid}; user_name=${this._cookieInfo.username}`,
            },
            qs: {
                req_name: 'remote_access_livinglight',
                req_action: 'status',
            },
        };
        this.IparkServerStatusParse(options, 'light');
    }

    IparkVehicleStatusOptions() {
        const options = {
            url: `http://${CONFIG.ipark_server.address}/webapp/car_parking.php`,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': `PHPSESSID=${this._cookieInfo.phpsessid}; user_id=${this._cookieInfo.userid}; user_name=${this._cookieInfo.username}`,
            },
            qs: {
                start: '1', // 시작 위치
                desiredPosts: '0', // 표시할 갯수
            },
        };
        this.IparkServerStatusParse(options, 'vehicle');
    }

    IparkDeliveryStatusOptions() {
        const options = {
            url: `http://${CONFIG.ipark_server.address}/webapp/deliveryList.php`,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': `PHPSESSID=${this._cookieInfo.phpsessid}; user_id=${this._cookieInfo.userid}; user_name=${this._cookieInfo.username}`,
            },
            qs: {
                start: '1', // 시작 위치
                desiredPosts: '0', // 표시할 갯수
            },
        };
        this.IparkServerStatusParse(options, 'delivery');
    }

    IparkEnergyStatusOptions() {
        const day = new Date();
        const dayString = day.getFullYear() + "-" + (("00" + (day.getMonth() + 1).toString()).slice(-2));
        const options_Elec = {
            url: `http://${CONFIG.ipark_server.address}/webapp/data/getEnergyAvr_monthly_Elec.php`,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': `PHPSESSID=${this._cookieInfo.phpsessid}; user_id=${this._cookieInfo.userid}; user_name=${this._cookieInfo.username}`,
            },
            qs: {
                eDate3: dayString, // 가져올 데이터 날짜
            },
        };
        this.IparkServerStatusParse2(options_Elec, 'energy_elec');
        const options_Water = {
            url: `http://${CONFIG.ipark_server.address}/webapp/data/getEnergyAvr_monthly_Water.php`,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': `PHPSESSID=${this._cookieInfo.phpsessid}; user_id=${this._cookieInfo.userid}; user_name=${this._cookieInfo.username}`,
            },
            qs: {
                eDate3: dayString, // 가져올 데이터 날짜
            },
        };
        this.IparkServerStatusParse2(options_Water, 'energy_water');
        const options_Gas = {
            url: `http://${CONFIG.ipark_server.address}/webapp/data/getEnergyAvr_monthly_Gas.php`,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': `PHPSESSID=${this._cookieInfo.phpsessid}; user_id=${this._cookieInfo.userid}; user_name=${this._cookieInfo.username}`,
            },
            qs: {
                eDate3: dayString, // 가져올 데이터 날짜
            },
        };
        this.IparkServerStatusParse2(options_Gas, 'energy_gas');
        const options_Hwater = {
            url: `http://${CONFIG.ipark_server.address}/webapp/data/getEnergyAvr_monthly_Hwater.php`,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': `PHPSESSID=${this._cookieInfo.phpsessid}; user_id=${this._cookieInfo.userid}; user_name=${this._cookieInfo.username}`,
            },
            qs: {
                eDate3: dayString, // 가져올 데이터 날짜
            },
        };
        this.IparkServerStatusParse2(options_Hwater, 'energy_hwater');
        const options_Heat = {
            url: `http://${CONFIG.ipark_server.address}/webapp/data/getEnergyAvr_monthly_Heat.php`,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Cookie': `PHPSESSID=${this._cookieInfo.phpsessid}; user_id=${this._cookieInfo.userid}; user_name=${this._cookieInfo.username}`,
            },
            qs: {
                eDate3: dayString, // 가져올 데이터 날짜
            },
        };
        this.IparkServerStatusParse2(options_Heat, 'energy_heat');
    }

    IparkLightCmdOptions(num, act) {
        const options = {
            url: `http://${CONFIG.ipark_server.address}/webapp/data/getHomeDevice.php`,
            headers: {
                'accept': 'application/xml',
                'User-Agent': 'Mozilla/5.0',
                'Cookie': `PHPSESSID=${this._cookieInfo.phpsessid}; user_id=${this._cookieInfo.userid}; user_name=${this._cookieInfo.username}`,
            },
            qs: {
                req_name: 'remote_access_livinglight',
                req_action: 'control',
                req_unit_num: num,
                req_ctrl_action: act,
            },
        };
        this.IparkServerCommand(options, num, act);
    }

    IparkServerStatusParse(options, name) {
        request.get(options, (error, response, body) => {
            if (!error && response.statusCode === 200) {
                switch (name) {
                    case 'light':
                        xml2js.parseString(body, (err, result) => {
                            if (err) {
                                warn(`xml parsing failed with error: ${err}`);
                                return;
                            }
                            if (result) {
                                const statusInfo = result.imap.service[0].status_info;
                                if (!statusInfo) {
                                    //warn('json parsing failed: body property not found');
                                    return;
                                }
                                try {
                                    statusInfo.forEach(status => {
                                        const unitNum = status.$.unit_num.replace(/switch/g, 'power');
                                        const unitStatus = status.$.unit_status;

                                        this.updateProperty('light', 'living', unitNum, unitStatus);
                                    });
                                } catch (e) {
                                    warn(`xml parsing failed with error: ${e}`);
                                }
                            }
                        });
                        break;
                    case 'vehicle':
                        try {
                            const vehicle_parse = JSON.parse(body);
                            if (!vehicle_parse[0]) {
                                //warn('json parsing failed: body property not found');
                                return;
                            }
                            const vehicle_result = {
                                "주차날짜": vehicle_parse[0].Dpark_date,
                                "차량번호": vehicle_parse[0].car_num.replace(/차량번호:&nbsp;/, ''),
                                "주차위치": vehicle_parse[0].park_loca.replace(/주차위치:&nbsp;/, ''),
                            }
                            this.updateProperty('vehicle', vehicle_parse[0].rownum, 'info', JSON.stringify(vehicle_result));
                        } catch (e) {
                            warn(`json parsing failed with error: ${e}`);
                            return;
                        }
                        break;
                    case 'delivery':
                        try {
                            const delivery_parse = JSON.parse(body);
                            if (!delivery_parse[0]) {
                                //warn('json parsing failed: body property not found');
                                return;
                            }
                            const delivery_result = {
                                "보관날짜": delivery_parse[0].Rregdate,
                                "보관위치": delivery_parse[0].box_num,
                                "보관상태": delivery_parse[0].action,
                            }
                            this.updateProperty('delivery', delivery_parse[0].rownum, 'info', JSON.stringify(delivery_result));
                        } catch (e) {
                            warn(`json parsing failed with error: ${e}`);
                            return;
                        }
                        break;
                }
            } else {
                warn(`request failed with error: ${error}`);
                return;
            }
        });
    }

    IparkServerStatusParse2(options, name) {
        request.get(options, (error, response, body) => {
            if (!error && response.statusCode === 200) {
                let parse;
                let result;
                const propName = name.split("_")[1];
                try {
                    switch (name) {
                        case 'energy_elec':
                            parse = JSON.parse(body);
                            result = {
                                "total_elec_usage": parse[1].data[2],
                                "average_elec_usage": parse[0].data[2],
                            }
                            break;
                        case 'energy_water':
                            parse = JSON.parse(body);
                            result = {
                                "total_water_usage": parse[1].data[2],
                                "average_water_usage": parse[0].data[2],
                            }
                            break;
                        case 'energy_gas':
                            parse = JSON.parse(body);
                            result = {
                                "total_gas_usage": parse[1].data[2],
                                "average_gas_usage": parse[0].data[2],
                            }
                            break;
                        case 'energy_hwater':
                            parse = JSON.parse(body);
                            result = {
                                "total_hwater_usage": parse[1].data[2],
                                "average_hwater_usage": parse[0].data[2],
                            }
                            break;
                        case 'energy_heat':
                            parse = JSON.parse(body);
                            result = {
                                "total_heat_usage": parse[1].data[2],
                                "average_heat_usage": parse[0].data[2],
                            }
                            break;
                    }
                    for (let [key, value] of Object.entries(result)) {
                        if (key.includes('total')) {
                            this.updateProperty('energy', propName, 'total', value);
                        } else if (key.includes('average')) {
                            this.updateProperty('energy', propName, 'equilibrium_average', value);
                        }
                    }
                } catch (e) {
                    warn(`json parsing failed with error: ${e}`);
                    return;
                }
            } else {
                warn(`request failed with error: ${error}`);
                return;
            }
        });
    }

    IparkServerCommand(options, num, act) {
        request.get(options, (error, response) => {
            if (!error && response.statusCode === 200) {
                let unitNum = num.replace(/switch/g, 'power');
                log('request Successful:', unitNum, act);
                this.mqttClientUpdate('light', 'living', unitNum, act)
            } else {
                warn(`request failed with error: ${error}`);
                return;
            }
        });
    }

};
_HOMERS485 = new _HOMERS485();