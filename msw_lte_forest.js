/**
 * Created by Wonseok Jung in KETI on 2022-09-05.
 */

/**
 * Copyright (c) 2020, OCEAN
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
 * following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
 * disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the
 * following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. The name of the author may not be used to endorse or promote products derived from this software without specific
 * prior written permission. THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES,
 * INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

    // for TAS of mission

let mqtt = require('mqtt');
let fs = require('fs');
const {exec, spawn} = require('child_process')
const {nanoid} = require('nanoid');
const util = require("util");
const db = require('node-localdb');

global.sh_man = require('./http_man');

let fc = {};
let config = {};

config.name = 'msw_lte_forest';
global.drone_info = '';

let lte_data = db('./' + config.name + '_data' + '.json');

try {
    drone_info = JSON.parse(fs.readFileSync('../drone_info.json', 'utf8'));

    config.directory_name = config.name + '_' + config.name;
    // config.sortie_name = '/' + sortie_name;
    config.gcs = drone_info.gcs;
    config.drone = drone_info.drone;
    config.lib = [];
}
catch (e) {
    // config.sortie_name = '';
    config.directory_name = '';
    config.gcs = 'KETI_MUV';
    config.drone = 'FC_MUV_01';
    config.lib = [];
}

// library 추가
let add_lib = {};
try {
    add_lib = JSON.parse(fs.readFileSync('./lib_lte_forest.json', 'utf8'));
    config.lib.push(add_lib);
}
catch (e) {
    add_lib = {
        name: 'lib_lte_forest',
        target: 'armv6',
        description: "[name] [portnum] [baudrate]",
        scripts: './lib_lte_forest',
        data: ['LTE'],
        control: []
    };
    config.lib.push(add_lib);
}

// msw가 muv로 부터 트리거를 받는 용도
// 명세에 sub_container 로 표기
let mobius_control_msw_topic = [];

let msw_sub_fc_topic = [];
// msw_sub_fc_topic.push('/TELE/drone/hb');
msw_sub_fc_topic.push('/TELE/drone/gpi');

let lib_data_msw_topic = [];

function init() {
    if (config.lib.length > 0) {
        for (let idx in config.lib) {
            if (config.lib.hasOwnProperty(idx)) {
                if (dr_mqtt_client) {
                    for (let i = 0; i < config.lib[idx].control.length; i++) {
                        let sub_container_name = config.lib[idx].control[i];
                        let _topic = '/Tele/' + config.name + '/' + sub_container_name;
                        dr_mqtt_client.subscribe(_topic);
                        mobius_control_msw_topic.push(_topic);
                        console.log('[local_mqtt] mobius_control_msw_topic[' + i + ']: ' + _topic);
                    }

                    for (let i = 0; i < config.lib[idx].data.length; i++) {
                        let container_name = config.lib[idx].data[i];
                        let _topic = '/MUV/data/' + config.lib[idx].name + '/' + container_name;
                        dr_mqtt_client.subscribe(_topic);
                        lib_data_msw_topic.push(_topic);
                        console.log('[local_mqtt] lib_data_msw_topic[' + i + ']: ' + _topic);
                    }
                }

                let obj_lib = config.lib[idx];
                setTimeout(runLib, 1000 + parseInt(Math.random() * 10), JSON.parse(JSON.stringify(obj_lib)));
            }
        }
    }
}

function runLib(obj_lib) {
    try {
        let scripts_arr = obj_lib.scripts.split(' ');

        let run_lib = spawn(scripts_arr[0], scripts_arr.slice(1));

        run_lib.stdout.on('data', (data) => {
            console.log('stdout: ' + data);
        });

        run_lib.stderr.on('data', (data) => {
            console.log('stderr: ' + data);
        });

        run_lib.on('exit', (code) => {
            console.log('exit: ' + code);

            setTimeout(runLib, 3000, obj_lib)
        });

        run_lib.on('error', (code) => {
            console.log('error: ' + code);
        });
    }
    catch (e) {
        console.log(e.message);
    }
}

let dr_mqtt_client = null;

dr_mqtt_connect('localhost');

function dr_mqtt_connect(broker_ip) {
    if (!dr_mqtt_client) {
        let connectOptions = {
            host: broker_ip,
            port: 1883,
            protocol: "mqtt",
            keepalive: 10,
            protocolId: "MQTT",
            protocolVersion: 4,
            clientId: config.name + '_mqttjs_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2 * 1000,
            connectTimeout: 30 * 1000,
            queueQoSZero: false,
            rejectUnauthorized: false
        };

        dr_mqtt_client = mqtt.connect(connectOptions);

        dr_mqtt_client.on('connect', () => {
            console.log('[dr_mqtt_connect] connected to ( ' + broker_ip + ' )');
            for (let idx in msw_sub_fc_topic) {
                if (msw_sub_fc_topic.hasOwnProperty(idx)) {
                    dr_mqtt_client.subscribe(msw_sub_fc_topic[idx]);
                    console.log('[local_mqtt] msw_sub_fc_topic[' + idx + ']: ' + msw_sub_fc_topic[idx]);
                }
            }
        });

        dr_mqtt_client.on('message', (topic, message) => {
            for (let idx in msw_sub_fc_topic) {
                if (msw_sub_fc_topic.hasOwnProperty(idx)) {
                    if (topic === msw_sub_fc_topic[idx]) {
                        setTimeout(on_process_fc_data, parseInt(Math.random() * 5), topic, message.toString());
                        break;
                    }
                }
            }
            for (let idx in lib_data_msw_topic) {
                if (lib_data_msw_topic.hasOwnProperty(idx)) {
                    if (topic === lib_data_msw_topic[idx]) {
                        setTimeout(on_receive_from_lib, parseInt(Math.random() * 5), topic, message.toString());
                        break;
                    }
                }
            }
            if (mobius_control_msw_topic.includes(topic)) {
                setTimeout(on_receive_from_muv, parseInt(Math.random() * 5), topic.substring(0, topic.length - 3), message.toString());
            }
        });

        dr_mqtt_client.on('error', (err) => {
            console.log(err.message);
        });
    }
}

let t_id = null;
let disconnected = true;
let MissionControl = {};

function on_receive_from_muv(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    parseControlMission(topic, str_message);
}

let sequence = 0;

function on_receive_from_lib(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    if (getType(str_message) === 'string') {
        str_message = (sequence.toString(16).padStart(2, '0')) + str_message;
    }
    else {
        str_message = JSON.parse(str_message);
        str_message.sequence = sequence;
        str_message = JSON.stringify(str_message);
    }

    sequence++;
    sequence %= 255;

    parseDataMission(topic, str_message);
}

function on_process_fc_data(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    let topic_arr = topic.split('/');
    fc[topic_arr[topic_arr.length - 1]] = JSON.parse(str_message);

    parseFcData(topic, str_message);
}

setTimeout(init, 1000);

// 유저 디파인 미션 소프트웨어 기능
///////////////////////////////////////////////////////////////////////////////
function parseDataMission(topic, str_message) {
    try {
        // User define Code
        let obj_lib_data = JSON.parse(str_message);

        if (fc.hasOwnProperty('gpi')) {
            Object.assign(obj_lib_data, JSON.parse(JSON.stringify(fc['gpi'])));
        }
        str_message = JSON.stringify(obj_lib_data);
        ///////////////////////////////////////////////////////////////////////

        let topic_arr = topic.split('/');
        let data_topic = '/' + config.name + '/Tele/' + topic_arr[topic_arr.length - 1];
        if (dr_mqtt_client) {
            dr_mqtt_client.publish(data_topic, str_message);
        }
    }
    catch (e) {
        console.log(e)
        console.log('[parseDataMission] data format of lib is not json');
    }
}

///////////////////////////////////////////////////////////////////////////////

function parseControlMission(topic, str_message) {
    try {
        // User define Code
        ///////////////////////////////////////////////////////////////////////

        let topic_arr = topic.split('/');
        let _topic = '/MUV/control/' + config.lib[0].name + '/' + topic_arr[topic_arr.length - 1];
        dr_mqtt_client.publish(_topic, str_message);
    }
    catch (e) {
        console.log('[parseControlMission] data format of lib is not json');
    }
}

function parseFcData(topic, str_message) {
    // User define Code
    // let topic_arr = topic.split('/');
    // if(topic_arr[topic_arr.length-1] == 'global_position_int') {
    //     let _topic = '/MUV/control/' + config.lib[0].name + '/' + config.lib[1].control[1]; // 'Req_enc'
    //     mqtt_client.publish(_topic, str_message);
    // }
    ///////////////////////////////////////////////////////////////////////
}

function mon_local_db(data_topic) {
    lte_data.findOne({}).then(function (u) {
        if (u !== undefined) {
            delete u['_id'];
            sh_man.crtci(data_topic + '?rcn=0', 0, u, null, function (rsc, res_body, parent, socket) {
                if (rsc === '2001') {
                    lte_data.remove(u);
                }
            });
        }
    });
}
