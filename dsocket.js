const TuyaApi = require('tuyapi');
module.exports = function(RED) {
    "use strict";
    function TuyaDLocal(config) {
        var node = this;
        node.config = config;
        RED.nodes.createNode(this, config);
    
        let tryReconnect = true;
        let connectInterval = null;
        let statusInterval = null;

        function make_msg(event){
            var available;
            if (node.tuyaDevice === undefined){
                available = false;
            }else{
                available = node.tuyaDevice.isConnected()
            }
            var msg = {}
            if ("in_msg" in node){
                msg = node.in_msg;
                delete node.in_msg;
            }else{
                msg.called = false;
             }
        //node.warn(data);
             if (!available){
                 msg.error = event;
             }
             if (msg.oldpayload === undefined){
                msg.oldpayload = "socket";
            }
             msg.data = {id:node.config.id, available: available, event: event };
             return msg;
        }

        function send_msg(event){
           
            var msg = make_msg(event);
            node.status({fill:"yellow",shape:"dot",text:"output "+msg.oldpayload+" "+event});
            node.send(msg);
        }


    
        node.on('close', (removed, done) => {
            disconnectOnClose();
            done();
        });
    
        node.on('input', (msg) => {
            node.status({fill:"yellow",shape:"dot",text:"input: "+msg.payload});
            msg.oldpayload=msg.payload;
             function disconnectOnClose() {
                clearTimeout(connectInterval);
                tryReconnect = false;
                node.log(`Disconnect on close request for ${node.config.name}`);
                if (node.tuyaDevice.isConnected()) {
                    node.log(`Device connected, disconnecting...`);
                    node.tuyaDevice.disconnect();
                }
            }

            function disconnect() {
                clearTimeout(connectInterval);
                tryReconnect = false;
                node.log(`Disconnect request for ${node.config.name}`);
                if (node.tuyaDevice.isConnected()) {
                    node.log(`Device connected, disconnecting...`);
                    node.tuyaDevice.disconnect();
                    node.log(`Disconnected`);
                }
                send_msg("disconnected");
                
            }
            config = node.config;
            msg.called = true; // for the dynamic socket we are always called so make sure there is return node info
 
            node.in_msg = msg;

            let command = msg.payload;
            if (typeof command === 'string') {
                switch (command) {
                    case 'request':
                        if (node.tuyaDevice!== undefined && node.tuyaDevice.isConnected()){
                          try{
                              node.status({fill:"yellow",shape:"dot",text:"get request"});
                              node.tuyaDevice.get({ schema: true });
                          }catch(e){
                            
                             send_msg(e);
                            
                            }
                        }else{
                          
                            send_msg(`request not made as device disconnected ${node.config.name}` )
                          
                        }
                        break;
                    case 'request1':
                        if (node.tuyaDevice!== undefined && node.tuyaDevice.isConnected()){
                            try{
                                node.status({fill:"yellow",shape:"dot",text:"get request"});
                                node.tuyaDevice.get({ schema: false });
                            }catch(e){
                                node.status({fill:"red",shape:"dot",text:"get request failed"});
                               send_msg(e)
                               
                              }
                          }else{
                              send_msg(`request not made as not connected ${node.config.name}`);
                             
                          }
                          break;  
                    case 'connect':{
                        var config = node.config;
                        //node.warn("id:"+ msg.id)
                        if (msg.hasOwnProperty("ip")){
                        
                            config.devIp = msg.ip;
                        }
                        if (msg.hasOwnProperty("key")){
                            config.devKey = msg.key;
                        }
                        if (msg.hasOwnProperty("id")){

                            config.devId = msg.id;
                        }
                        const tuyaDevice = new TuyaApi({
                            id: config.devId,
                            key: config.devKey,
                            ip: config.devIp,
                            version: config.protocolVer
                        });
                        node.tuyaDevice = tuyaDevice;
                        node.tuyaDevice.connecting = false;
                        tuyaDevice.on('connected', () => {
                            //node.log(`Device ${deviceInfo.name} connected!`);
                            node.tuyaDevice.connecting=false;
                            clearTimeout(connectInterval);
                            //if (config.pollingInterval !== 0) {
                             //   statusInterval = setInterval(() => {
                            //        tuyaDevice.get({ schema: true }).then(() => {}).catch(ex => {
                            //            node.log(`Error while polling status for ${deviceInfo.name}: ${ex.message}`);
                            //        });
                            //    }, config.pollingInterval * 1000);
                            //}
                            node.status({ fill: 'green', shape: 'dot', text: tuyaDevice.device.ip +  ` connected @ ${new Date().toLocaleTimeString()}` });
                            send_msg("connected")
    
                        });
                    
                        tuyaDevice.on('disconnected', () => {
                            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
                            handleDisconnection();
                        });
                        tuyaDevice.on('error', (err) => {
                            //node.log(`Device ${deviceInfo.name} in error state: ${err}, reconnect: ${tryReconnect}`);
                            handleDisconnection();
                        });
                        tuyaDevice.on('data', (data, commandByte) => {
                            node.status({fill:"yellow",shape:"dot",text:"data received"});
                            if (commandByte == 8) {
                                //node.warn("proactive");
                                return;
                            }
                           var msg = make_msg("data");
                            msg.commandByte = commandByte;
                            msg.payload = data;
                            node.send( msg);
                               
                        }); 
                        function connect(delay) {
                            //node.log(`Connecting to ${deviceInfo.name} @ ${deviceInfo.ip} (delay: ${delay ? 'yes' : 'no'})`)
                            clearTimeout(connectInterval);
                            clearTimeout(statusInterval);
                            
                            if (tuyaDevice.isConnected()) {
                                
                                return;
                            }else if (tuyaDevice.connecting){
                                
                                return  
                            }
                            tuyaDevice.connecting = true;
                            node.status({fill:"red",shape:"dot",text:"finding"});
                            tuyaDevice.find({'options': {'timeout':4000}}).then( () => {
                                node.status({fill:"yellow",shape:"dot",text:"found"});

                                    if (tuyaDevice.isConnected()) {
                                        tuyaDevice.connecting = false;
                                        send_msg("found already connected")
                                        return;
                                    }
                                    node.status({ fill: 'yellow', shape: 'dot', text: 'connecting...' });
                                    tuyaDevice.connect().then(() => { 
                                        tuyaDevice.connecting = false;
                                      
                                       

                                    }).catch((e) => { 
                                        tuyaDevice.connecting = false;
                                        node.status({fill:"red",shape:"ring",text:"connect failed: " + e + "id:"+tuyaDevice.device.id+ "ip:"+tuyaDevice.device.ip});
                                        send_msg("connect catch "+e)
  
                                    });
                                
                            }, (reason) => { 
                                tuyaDevice.connecting = false;
                                node.status({fill:"red",shape:"ring",text:"find failed: " + reason + "id:"+tuyaDevice.device.id+ "ip:"+tuyaDevice.device.ip});
                                send_msg("connect find: "+reason)
                            }); 
                           
                        }
                    
 
                    
                        function handleDisconnection() {
                            clearTimeout(statusInterval);
                            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
                            if (tryReconnect) {
                        
                                node.status({fill:"yellow",shape:"dot",text:"delayed reconnect"});
                                tuyaDevice.connectInterval = setTimeout(() => connect(), 5000);
                    
                                
                            }
                            node.status({ fill: 'red', shape: 'ring', text: 'disconnected: '+node.tuyaDevice.device.id });
                            send_msg("disconnected");
                          
                        } 
                        //node.warn("connect command");
                        connect();
                        break;
                    }
                    case 'disconnect':
                        disconnect();
                        break;
                    case 'toggle':
                        node.tuyaDevice.toggle();
                        break;
                    
                }
            } else if ( typeof command == "boolean" ) {
				tuyaDevice.set({set: req}).then( () => {
					node.status({fill:"green",shape:"dot",text: 'set success at:' + getHumanTimeStamp()});
				}, (reason) => {
					node.status({fill:"red",shape:"dot",text: 'set state failed:' + reason});
				});

			} else if ( "multiple" in command) {
				tuyaDevice.set({
					multiple:true,
					data: command.data
				});
			} else if ('dps' in command) {
                //node.warn("set "+command.dps);
                tuyaDevice.set(command);
            } else {
                node.warn(`Unknown command for ${deviceInfo.name}: ${command}`);
            }
        });
    
 
    
    }
	RED.nodes.registerType("tuya-local-dsocket",TuyaDLocal);
}