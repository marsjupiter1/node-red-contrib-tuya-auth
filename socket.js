const TuyaApi = require('tuyapi');

module.exports = function(RED) {
    "use strict";
    function TuyaLocal(config) {
        RED.nodes.createNode(this, config);
    
        const node = this;
        node.config = config;
        const tuyaDevice = new TuyaApi({
            id: config.devId,
            key: config.devKey,
            ip: config.devIp,
            version: config.protocolVer
        });
    
        let tryReconnect = true;
        let connectInterval = null;
        let statusInterval = null;
        let deviceInfo = { ip: config.devIp, name: config.devName, id: config.devId };
       
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
             msg.data = {id:node.config.id, available: available, event: event };
             return msg;
        }

        function send_msg(event){
         
            var msg = make_msg(event);
            node.send(msg);
        }
        function connect(delay) {
            //node.log(`Connecting to ${deviceInfo.name} @ ${deviceInfo.ip} (delay: ${delay ? 'yes' : 'no'})`)
            clearTimeout(connectInterval);
            clearTimeout(statusInterval);
            if (tuyaDevice.isConnected()) {
  
                
                return;
            }
            node.status({fill:"red",shape:"dot",text:"finding"});
  
            tuyaDevice.find({'options': {'timeout':3000}}).then( () => {
                node.status({fill:"yellow",shape:"dot",text:"found"});
                if (delay) {
                    connectInterval = setTimeout(() => connect(), 5000);
                    send_msg("connect on 5");
                } else {
                    if (tuyaDevice.isConnected()) {
                        send_msg("already connected");
                        return;
                    }
                    node.status({ fill: 'yellow', shape: 'dot', text: 'connecting...' });
                    tuyaDevice.connect().then(() => { 
                        send_msg("connec then");
                    }).catch(() => { 
                      send_msg("catch failed connect")
                    });
                }
            }, (reason) => { 
                node.status({fill:"red",shape:"ring",text:"find failed: " + reason+ "id:"+tuyaDevice.id+ "ip:"+tuyaDevice.ip});
                send_msg("find failed")
         
            }); 
           
        }
    
        function disconnect() {
            clearTimeout(connectInterval);
            tryReconnect = false;
            node.log(`Disconnect request for ${deviceInfo.name}`);
            if (tuyaDevice.isConnected()) {
                node.log(`Device connected, disconnecting...`);
                tuyaDevice.disconnect();
                node.log(`Disconnected`);
            }
            send_msg("disconnect");
        
        }
    
        function handleDisconnection() {
            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
 
            clearTimeout(statusInterval);
            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
            if (tryReconnect) {
               
                connect(true);
                 // go on to emit a message in case anyones listening
            }
            send_msg("disconnection");

        }
    
        tuyaDevice.on('connected', () => {
            //node.log(`Device ${deviceInfo.name} connected!`);
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
    
        //7=requested response, 8=proactive update from device)
        tuyaDevice.on('data', (data, commandByte) => {
            if (commandByte == 8) {
                //node.warn("proactive");
                return;
            }
            var msg = make_msg("data")
            msg.commandByte = commandByte;
            msg.payload = data;
          
            node.send( msg);
            
        });
    
        node.on('input', (msg) => {
            msg.called = true;
            node.in_msg = msg;
            let command = msg.payload;
            if (typeof command === 'string') {
                switch (command) {
                    case 'request':
                        if (tuyaDevice.isConnected()){
                             try{
                                tuyaDevice.get({ schema: true });
                             }catch(e){
                                send_msg(e)
                            }
                            return;
                        }else{
                            send_msg(`request not made as not connected ${deviceInfo.name}`);
                            
                        } 
                        break;
                    case 'request1':
                        if (tuyaDevice.isConnected()){
                            try{
                               tuyaDevice.get({ schema: false });
                               send_msg("got");
                            }catch(e){
                               send_msg(e)
                           }
                           return;
                       }else{
                          send_msg( `request1 not made as not connected ${deviceInfo.name}`);
                         
                       } 
                        break;    
                    case 'connect':
                        //node.warn("connect command");
                        connect();
                        break;
                    case 'disconnect':
                        disconnect();
                        break;
                    case 'toggle':
                        tuyaDevice.toggle();
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
                node.log(`Unknown command for ${deviceInfo.name}: ${command}`);
            }
        });
    
        node.on('close', (removed, done) => {
            disconnect();
            done();
        });
    
        connect();
    }
	RED.nodes.registerType("tuya-local-socket",TuyaLocal);
};    