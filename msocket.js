const { createSocket } = require('dgram');
const TuyaApi = require('tuyapi');
module.exports = function (RED) {
    "use strict";
    function TuyaMLocal(config) {
        var node = this;
        node.config = config;


        RED.nodes.createNode(this, config);

        node.tuyaDevices = {};
        node.in_msgs = {};

        node.on('close', (removed, done) => {
            Object.keys(node.tuyaDevices).forEach(function (key) {
                disconnect(node.tuyaDevices[key]);

            });

            done();
        });


        function send_msg(tuyaDevice, event) {


            var msg = make_msg(tuyaDevice, event);

            node.send(msg);
            //node.status({ fill: "yellow", shape: "dot", text: "output " + msg.oldpayload + " " + event });
        }
        function make_msg(tuyaDevice, event) {
            var msg = {}

            if (tuyaDevice === undefined) {
                msg.data = { id: "undefined", available: false, event: event };
                return msg;
            }
            var in_msg;
            var id;
            if (typeof tuyaDevice === 'string') {
                id = tuyaDevice;
                in_msg = node.in_msgs[tuyaDevice]
            } else {
                id = tuyaDevice.device.id;
            }
            in_msg = node.in_msgs[id];

            if (in_msg !== undefined) {
                msg = in_msg;
                msg.called = true;
                //node.warn("delete 788");
                delete node.in_msgs[id];
            } else {
                //node.warn("no message in disconnect");
                msg.called = false;
            }
            var available;
            if (typeof tuyaDevice === 'string') {
                available = true;
            } else {
                available = tuyaDevice.isConnected();
            }
            if (!available) {
                msg.error = event;
            }

            if (msg.oldpayload === undefined) {
                msg.oldpayload = "socket";
            }
            msg.data = { id: id, available: available, event: event };
            return msg;
        }

        function handleDisconnection(tuyaDevice) {
            clearTimeout(tuyaDevice.statusInterval);
            send_msg(tuyaDevice, "disconnected");
            node.status({ fill: 'red', shape: 'ring', text: 'disconnected: ' + tuyaDevice.device.id+ `" @ ${new Date().toLocaleTimeString()}` });
            if (tuyaDevice.tryReconnect) {
                tuyaDevice.disconnect();
                tuyaDevice = createNewSocket(tuyaDevice.device);
                node.status({ fill: "red", shape: "dot", text: "delayed reconnect" });
                tuyaDevice.connectInterval = setTimeout(() => connect(tuyaDevice), 1000);

            }


        }

        function connect(tuyaDevice) {

            clearTimeout(tuyaDevice.connectInterval);
            clearTimeout(tuyaDevice.statusInterval);
            if (tuyaDevice.isConnected()) {

                return;
            } else if (tuyaDevice.connecting) {

                return
            }
            node.status({ fill: "yellow", shape: "dot", text: "finding" });
            tuyaDevice.connecting = true;
            tuyaDevice.find({ 'options': { 'timeout': 5000 } }).then(() => {
                node.status({ fill: "yellow", shape: "dot", text: "found" });

                if (tuyaDevice.isConnected()) {
                    send_msg(tuyaDevice, "already connected");
                    return;
                }
                node.status({ fill: 'yellow', shape: 'dot', text: 'connecting...' });

                tuyaDevice.connect().then(() => {
                    //send_msg(tuyaDevice,"connect then");
                    tuyaDevice.connecting = false;

                    //node.warn("connect then block")
                }).catch((e) => {
                    //node.warn("catch connect");
                    node.status({ fill: "red", shape: "ring", text: "connect failed: " + e + "id:" + tuyaDevice.device.id + " ip:" + tuyaDevice.device.ip });
                    tuyaDevice.connecting = false;

                    send_msg(tuyaDevice, "failed connect: " + e);
                });

            }, (reason) => {
                tuyaDevice.connecting = false;
                send_msg(tuyaDevice, "find failed: " + reason);
                node.status({ fill: "red", shape: "ring", text: "find failed: " + reason + "id: " + tuyaDevice.device.id + " ip:" + tuyaDevice.device.ip });
            });

        }

        function createNewSocket(msg){
            const tuyaDevice = new TuyaApi({
                id: msg.id,
                key: msg.key,
                ip: msg.ip,
                version: config.protocolVer
            });
             tuyaDevice.tryReconnect = true;
             tuyaDevice.connectInterval = null;
            tuyaDevice.statusInterval = null;
            tuyaDevice.connecting = false;
            node.tuyaDevices[msg.id] = tuyaDevice;
            tuyaDevice.on('connected', () => {
                node.warn(`Device ${deviceInfo.name} connected!`);
                clearTimeout(tuyaDevice.connectInterval);
                tuyaDevice.tryReconnect = false;
                tuyaDevice.connectInterval = null;
                tuyaDevice.statusInterval = null;
                tuyaDevice.connecting = false;
                //if (config.pollingInterval !== 0) {
                //   statusInterval = setInterval(() => {
                //        tuyaDevice.get({ schema: true }).then(() => {}).catch(ex => {
                //            node.log(`Error while polling status for ${deviceInfo.name}: ${ex.message}`);
                //        });
                //    }, config.pollingInterval * 1000);
                //}
                node.status({ fill: 'green', shape: 'dot', text: tuyaDevice.device.ip + ` connected @ ${new Date().toLocaleTimeString()}` });
                send_msg(tuyaDevice, "connected");

            });

            tuyaDevice.on('disconnected', () => {

                handleDisconnection(tuyaDevice);
            });
            tuyaDevice.on('error', (err) => {
                node.warn(`Device ${tuyaDevice.device.id} in error state: ${err}, reconnect: ${tuyaDevice.tryReconnect}`);
                tuyaDevice.tryReconnect= true;// need to kill and retart
                handleDisconnection(tuyaDevice);
            });
            tuyaDevice.on('data', (data, commandByte) => {
                //node.status({fill:"green",shape:"dot",text: tuyaDevice.device.ip+" id:" + tuyaDevice.device.id + `"data received ${new Date().toLocaleTimeString()}`});
                if (commandByte == 8) {
                    node.warn("proactive");
                    return;
                }
                var msg = make_msg(tuyaDevice, true, "data")
                msg.commandByte = commandByte;
                msg.payload = data;
                node.send(msg);

            });
            return tuyaDevice;
        }

        node.on('input', (msg) => {

            //node.status({ fill: "yellow", shape: "dot", text: "input: " + msg.payload });
            msg.oldpayload = msg.payload
            if (msg.force === undefined && node.in_msgs[msg.id] != undefined) {
                msg.error = "already processing message " + node.in_msgs[msg.id];
                msg.old = node.in_msgs[msg.id];
                if (msg.timestamp - msg.old.timestamp < 60000) {
                    node.status({ fill: "red", shape: "dot", text: "eek " + msg.payload });
                    //node.send(msg)

                }
            }


            function disconnect(tuyaDevice) {

                clearTimeout(tuyaDevice.connectInterval);
                tuyaDevice.tryReconnect = false;
                node.log(`Disconnect request for ${tuyaDevice.device.id}`);
                if (tuyaDevice.isConnected()) {
                    log(`Device connected, disconnecting...`);
                    tuyaDevice.disconnect();
                }

                send_msg(tuyaDevice, "disconnected on request");

            }



            msg.called = true; // for the dynamic socket we are always called so make sure there is return node info



            let command = msg.payload;

            if (command != "status") {
                if (msg.id === undefined) {

                    node.warn("missing device id");
                    node.send(msg);
                    return;
                }

                if (msg.key === undefined) {

                    node.warn("missing device key");
                    node.send(msg);
                    return;
                }
            } else {
                msg.id = "status";
            }
            var tuyaDevice = node.tuyaDevices[msg.id];


            node.in_msgs[msg.id] = msg;


            //node.warn("check command");
            if (typeof command === 'string') {
                switch (command) {
                    case 'request':

                        if (tuyaDevice !== undefined && tuyaDevice.isConnected()) {
                            try {
                                //node.status({ fill: "yellow", shape: "dot", text: "get request" });
                                tuyaDevice.get({ schema: true });
                                //send_msg(tuyaDevice,"request got");
                            } catch (e) {

                                node.status({ fill: "red", shape: "dot", text: "get request failed: " + tuyaDevice.isConnected() });
                                send_msg(tuyaDevice, "request error");

                            }
                        } else if (tuyaDevice === undefined) {
                            node.error = `missing device ${msg.id}`;
                            node.warn(node.error);
                            msg.data = { available: false, id: msg.id }
                            node.send(msg);
                        } else {
                            send_msg(tuyaDevice, `request not made as not connected ${msg.id}`);

                        }
                        break;
                    case 'request1':
                        if (tuyaDevice !== undefined && tuyaDevice.isConnected()) {
                            try {
                                //node.status({ fill: "yellow", shape: "dot", text: "get request1" });
                                tuyaDevice.get({ schema: false });
                                //send_msg(tuyaDevice,"request1 got");
                            } catch (e) {
                                node.status({ fill: "red", shape: "dot", text: "get request1 failed: " + tuyaDevice.isConnected() });
                                send_msg(tuyaDevice, "request1 error");

                            }
                        } else if (tuyaDevice === undefined) {
                            node.error = `missing device ${msg.id}`;
                            node.warn(node.error);
                            msg.data = { available: false, id: msg.id }
                            node.send(msg);
                        } else {
                            send_msg(tuyaDevice, `request1 not made as not connected ${msg.id}`);

                        }
                        break;
                    case 'status':
                        var status = {};
                        Object.keys(node.tuyaDevices).forEach(function (key) {
                            var tuyaDevice = node.tuyaDevices[key];
                            status[tuyaDevice.device.id] = { ip: tuyaDevice.device.ip, available: tuyaDevice.isConnected() }
                        });

                        var msg = make_msg("status", "status");

                        msg.payload = status;
                        node.send(msg)
                        break;
                    case 'connect': {
                        var config = node.config;

                        if (node.tuyaDevices[msg.id] !== undefined) {
                            if (node.tuyaDevices[msg.id].isConnected()) {
                                send_msg(node.tuyaDevices[msg.id], "already connected");
                                return;
                            } else {
                                node.tuyaDevices[msg.id].tryReconnect = false;
                                node.tuyaDevices[msg.id].disconnect();
                                delete node.tuyaDevices[msg.id];
                                //node.warn("delete old device");

                            }
                        }

                        tuyaDevice = createNewSocket(msg);
                       




  
                        //
                        //node.warn("call connect");
                        connect(tuyaDevice, 0);
                        break;
                    }
                    case 'disconnect':
                        disconnect(tuyaDevice);
                        break;
                    case 'toggle':
                        tuyaDevice.toggle();
                        break;

                }
            } else if (typeof command == "boolean") {
                tuyaDevice.set({ set: req }).then(() => {
                    node.status({ fill: "green", shape: "dot", text: 'set success at:' + getHumanTimeStamp() });
                }, (reason) => {
                    node.status({ fill: "red", shape: "dot", text: 'set state failed:' + reason });
                });

            } else if ("multiple" in command) {
                tuyaDevice.set({
                    multiple: true,
                    data: command.data
                });
            } else if ('dps' in command) {
                //node.warn("set "+command.dps);
                tuyaDevice.set(command);
            }
        });


    }
    RED.nodes.registerType("tuya-local-msocket", TuyaMLocal);
};