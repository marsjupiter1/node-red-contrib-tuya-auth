const TuyaApi = require('tuyapi');
module.exports = function(RED) {
    "use strict";
    function TuyaDLocal(config) {
        var node = this;
        node.config = config;
        RED.nodes.createNode(this, config);
    
  

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
            //node.status({fill:"yellow",shape:"dot",text:"output "+msg.oldpayload+" "+event});
            node.send(msg);
        }

        function connect(delay) {
            
            //node.log(`Connecting to ${deviceInfo.name} @ ${deviceInfo.ip} (delay: ${delay ? 'yes' : 'no'})`)
            clearTimeout(node.tuyaDeviceconnectInterval);
            clearTimeout(node.tuyaDevicestatusInterval);

            var tuyaDevice = node.tuyaDevice;
            
            if (node.tuyaDevice.isConnected()) {
                return;
            }//else if (tuyaDevice.connecting){
            //    
            //    return  
            //}
           
            tuyaDevice.connecting = true;
            node.status({fill:"yellow",shape:"dot",text:"finding"});
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
                        node.status({fill:"red",shape:"ring",text:"connect failed: " + e + "id:"+tuyaDevice.device.id+ " ip:"+tuyaDevice.device.ip});
                        send_msg("connect catch "+e)

                    });
                
            }, (reason) => { 
                tuyaDevice.connecting = false;
                node.status({fill:"red",shape:"ring",text:"find failed: " + reason + "id:"+tuyaDevice.device.id+ " ip:"+tuyaDevice.device.ip});
                send_msg("connect find: "+reason)
            }); 
           
        }
        function disconnect() {
            clearTimeout(node.tuyaDevice.donnectInterval);
            node.tuyaDevice.tryReconnect = false;
            node.log(`Disconnect request for ${node.config.name}`);
            if (node.tuyaDevice.isConnected()) {
                node.log(`Device connected, disconnecting...`);
                node.tuyaDevice.disconnect();
                node.log(`Disconnected`);
            }
            send_msg("disconnected by request");
            
        }

        function handleDisconnection(tuyaDevice) {
             
            clearTimeout(tuyaDevice.statusInterval);
            clearTimeout(tuyaDevice.connectInterval);
            tuyaDevice.disconnect();
            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
            if (tuyaDevice.tryReconnect) {
                tuyaDevice.tryReconnect = false;
                
                tuyaDevice = createNewSocket();
                node.status({fill:"red",shape:"dot",text:"delayed reconnect"});
                tuyaDevice.connectInterval = setTimeout(() => connect(), 5000);
    
                
            }
          
        } 

        function disconnectOnClose() {
            clearTimeout(connectInterval);
            tryReconnect = false;
            node.log(`Disconnect on close request for ${node.config.name}`);
            if (node.tuyaDevice.isConnected()) {
                node.log(`Device connected, disconnecting...`);
                node.tuyaDevice.disconnect();
            }
        }

        function createNewSocket(){
            const tDevice = new TuyaApi({
                id: node.config.devId,
                key: node.config.devKey,
                ip: node.config.devIp,
                version: config.protocolVer
            });
            tDevice.tryReconnect = true;
            tDevice.connectInterval = null;
            tDevice.statusInterval = null;
            node.warn("connect on "+node.config.devId+" "+node.config.devKey+" "+node.config.devIp);
            node.tuyaDevice = tDevice;
            tDevice.connecting = false;
            tDevice.on('connected', () => {
                node.warn(`Device ${tDevice.device.id} connected!`);
                //node.tuyaDevice.connecting=false;
                clearTimeout(tDevice.connectInterval);
                //if (config.pollingInterval !== 0) {
                 //   statusInterval = setInterval(() => {
                //        tuyaDevice.get({ schema: true }).then(() => {}).catch(ex => {
                //            node.log(`Error while polling status for ${deviceInfo.name}: ${ex.message}`);
                //        });
                //    }, config.pollingInterval * 1000);
                //}
                node.status({ fill: 'green', shape: 'dot', text: tDevice.device.ip +  ` connected @ ${new Date().toLocaleTimeString()}` });
                send_msg("connected")

            });
        
            tDevice.on('disconnected', () => {
                node.warn(`Device ${tDevice.device.id} disconnected, reconnect: ${tDevice.tryReconnect}`);
                handleDisconnection(tDevice);
            });
            tDevice.on('error', (err) => {
                node.warn(`Device ${tDevice.device.id} in error state: ${err}, reconnect: ${tDevice.tryReconnect}`);
                tDevice.tryReconnect= false;// let die
  
                handleDisconnection(tDevice);
            });
            tDevice.on('data', (data, commandByte) => {
                node.status({fill:"green",shape:"dot",text: tDevice.device.ip + " id:" + tDevice.device.id +  ` data received ${new Date().toLocaleTimeString()}`});
                if (commandByte == 8) {
                    //node.warn("proactive");
                    return;
                }
               var msg = make_msg("data");
                msg.commandByte = commandByte;
                msg.payload = data;
                node.send( msg);
                   
            }); 

            return tDevice;
        }
    
        node.on('input', (msg) => {
            //node.status({fill:"yellow",shape:"dot",text:"input: "+msg.payload});
            msg.oldpayload=msg.payload;
 
          

            config = node.config;
            msg.called = true; // for the dynamic socket we are always called so make sure there is return node info
 
            node.in_msg = msg;

            let command = msg.payload;

            if (node.tuyaDevice === undefined && command != "connect"){
                send_msg("command sent before connection attempted");
                return
            }
            if (typeof command === 'string') {
                switch (command) {
                    case 'request':
                        if ( node.tuyaDevice.isConnected()){
                          try{
                             // node.status({fill:"yellow",shape:"dot",text:"get request"});
                              node.tuyaDevice.get({ schema: true });
                          }catch(e){
                            
                             send_msg(e);
                            
                            }
                        }else{
                          
                            send_msg(`request not made as device disconnected ${node.config.name}` )
                          
                        }
                        break;
                    case 'request1':
                        if (node.tuyaDevice.isConnected()){
                            try{
                                //node.status({fill:"yellow",shape:"dot",text:"get request"});
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
                        if (node.tuyaDevice !== undefined && node.tuyaDevice.isConnected()){
                            send_msg("already connected");
                            return;
                        }
                       
                        //node.warn("id:"+ msg.id)
                        if (msg.hasOwnProperty("ip")){
                        
                            node.config.devIp = msg.ip;
                        }
                        if (msg.hasOwnProperty("key")){
                            node.config.devKey = msg.key;
                        }
                        if (msg.hasOwnProperty("id")){

                            node.config.devId = msg.id;
                        }
                        createNewSocket();
                       
 
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
				node.tuyaDevice.set({set: req}).then( () => {
					node.status({fill:"green",shape:"dot",text: 'set success at:' + getHumanTimeStamp()});
				}, (reason) => {
					node.status({fill:"red",shape:"dot",text: 'set state failed:' + reason});
				});

			} else if ( "multiple" in command) {
				node.tuyaDevice.set({
					multiple:true,
					data: command.data
				});
			} else if ('dps' in command) {
                //node.warn("set "+command.dps);
                node.tuyaDevice.set(command);
            } else {
                node.warn(`Unknown command for ${deviceInfo.name}: ${command}`);
            }
        });
    
 
    
        node.on('close', (removed, done) => {
            if (node.tuyaDevice !== undefined){
                disconnectOnClose();
            }
            done();
        });
    
    }
	RED.nodes.registerType("tuya-local-dsocket",TuyaDLocal);
}