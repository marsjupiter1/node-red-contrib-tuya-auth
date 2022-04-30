
const { notDeepStrictEqual } = require('assert');
const { cp } = require('fs');
const { maxHeaderSize } = require('http');
const { send } = require('process');
const TuyaApi = require('tuyapi');

module.exports = function(RED) {
    "use strict";
    function TuyaLocal(config) {
        RED.nodes.createNode(this, config);
    
        const node = this;
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
       
    
        function connect(delay) {
            //node.log(`Connecting to ${deviceInfo.name} @ ${deviceInfo.ip} (delay: ${delay ? 'yes' : 'no'})`)
            clearTimeout(connectInterval);
            clearTimeout(statusInterval);
            if (tuyaDevice.isConnected()) {
                node.log(`Device ${deviceInfo.name} already connected.`);
                var msg = {}
                if ("in_msg" in node){
                    msg = node.in_msg;
                    msg.called = true;
                    delete node.in_msg;
                }else{
                    //node.warn("no message"+node.in_msg);
                    msg.called = false;
                }
                node.send(msg);
                return;
            }
            node.status({fill:"red",shape:"dot",text:"finding"});
  
            tuyaDevice.find({'options': {'timeout':3000}}).then( () => {
                node.status({fill:"yellow",shape:"dot",text:"found"});
                if (delay) {
                    connectInterval = setTimeout(() => connect(), 5000);
                } else {
                    if (tuyaDevice.isConnected()) {
                        node.log(`Device ${deviceInfo.name} already connected.`);
                        var msg = {}
                        if ("in_msg" in node){
                            msg = node.in_msg;
                            msg.called = true;
                            delete node.in_msg;
                        }else{
                            //node.warn("no message"+node.in_msg);
                            msg.called = false;
                        }
                        node.send(msg);
                        return;
                    }
                    node.status({ fill: 'yellow', shape: 'dot', text: 'connecting...' });
                    tuyaDevice.connect().then(() => { 
                        var msg = {}
                        if ("in_msg" in node){
                            msg = node.in_msg;
                            msg.called = true;
                            delete node.in_msg;
                        }else{
                            //node.warn("no message"+node.in_msg);
                            msg.called = false;
                        }
                        msg.error = "connect then ";
                        node.send(msg);
                    }).catch(() => { 
                        var msg = {}
                        if ("in_msg" in node){
                            msg = node.in_msg;
                            msg.called = true;
                            delete node.in_msg;
                        }else{
                            //node.warn("no message"+node.in_msg);
                            msg.called = false;
                        }
                        msg.error = "catch failed connect";
                        node.send(msg);
                    });
                }
            }, (reason) => { 
                node.status({fill:"red",shape:"ring",text:"find failed: " + reason+ "id:"+tuyaDevice.id+ "ip:"+tuyaDevice.ip});
                var msg = {}
                if ("in_msg" in node){
                    msg = node.in_msg;
                    msg.called = true;
                    delete node.in_msg;
                }else{
                    //node.warn("no message"+node.in_msg);
                    msg.called = false;
                }
                msg.error = "find failed";
                node.send(msg);
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
            var msg = {}
            if ("in_msg" in node){
                msg = node.in_msg;
                msg.called = true;
                delete node.in_msg;
            }else{
                //node.warn("no message"+node.in_msg);
                msg.called = false;
            }
            msg.data = {  deviceinfo:deviceInfo, available: false, event:"disconnect" };
            node.send(msg);
        
        }
    
        function handleDisconnection() {
            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
 
            clearTimeout(statusInterval);
            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
            if (tryReconnect) {
               
                connect(true);
                 // go on to emit a message in case anyones listening
            }
             var msg = {}
            if ("in_msg" in node){
                msg = node.in_msg;
                msg.called = true;
                delete node.in_msg;
            }else{
                //node.warn("no message"+node.in_msg);
                msg.called = false;
            }
            msg.data = {  deviceinfo:deviceInfo, available: false, event:"disconnection" };
            node.send(msg);
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
            var msg = {}
            if ("in_msg" in node){
                msg = node.in_msg;
                msg.called = true;
                delete node.in_msg;
            }else{
                msg.called = false;
            }
            msg.data = {  deviceinfo:deviceInfo, available: true, event: "connected" }
            node.send(msg);
          
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
            var msg = {}
            if ("in_msg" in node){
                msg = node.in_msg;
                msg.called = true;
                delete node.in_msg;
            }else{
                //node.warn("no message"+node.in_msg);
                msg.called = false;
            }
            //node.warn(data);
            msg.data = {deviceInfo, available: true };
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
                                 msg.error = e;
                                node.send(msg);
                                delete node.in_msg;
                            }
                            return;
                        }else{
                            msg.error = `request not made as not connected ${deviceInfo.name}`;
                            msg.data = {  deviceinfo:deviceInfo, available: true, event: "not connected so can't service request" }
                            node.send(msg);
                            delete node.in_msg;
                            
                        } 
                        break;
                    case 'request1':
                        if (tuyaDevice.isConnected()){
                            try{
                               tuyaDevice.get({ schema: false });
                            }catch(e){
                                msg.error = e;
                               node.send(msg);
                               delete node.in_msg;
                           }
                           return;
                       }else{
                           msg.error = `request not made as not connected ${deviceInfo.name}`;
                           msg.data = {  deviceinfo:deviceInfo, available: true, event: "not connected so can't service request1" }
 
                           node.send(msg);
                           delete node.in_msg;
                         
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

    function tuya_auth(config) {
        RED.nodes.createNode(this, config);

        var node = this;
        this.topic = config.topic;
        this.host = config.host;
        this.topics = {};

        this.on("input", function(msg) {
                var axios = require("axios");
                const signUrl = '/v1.0/token?grant_type=1';
                const timestamp = Date.now().toString();
                
                var host = node.host;
                if (msg.hasOwnProperty("host")){
                    host = msg.host;
                }
                var url = host+signUrl;

                var secretKey="";
                if (msg.hasOwnProperty("secretKey")){
                  secretKey = msg.secretKey;
                }
                var clientKey="";
                if (msg.hasOwnProperty("clientKey")){
                    clientKey = msg.clientKey;
                }
                
                var answer = getRequestAuth(timestamp,clientKey,secretKey,signUrl, "GET", {}, "");
                msg.signStr = answer.signStr;
                msg.sortedQuery = answer.sortedQuery;
                const headers = {
                  t: timestamp,
                  sign_method: 'HMAC-SHA256',
                  client_id: clientKey,
                  sign:  answer.sign
                };
                msg.headers = headers;
                var httpClient = axios.create({
                    baseURL: host,
                    timeout: 5 * 1e3,
                  });
                //node.warn(host + " > "+httpClient);  
                httpClient.get(signUrl, { headers }).then(res => {
                  
                    msg.payload = res.data;
                    msg.http_success = true;
                    node.send(msg);
                  })
                  .catch(error => {
                    msg.http_success = false;
                    msg.payload = error;
                    node.send(msg)
                  })
              
        });
    }

    RED.nodes.registerType("tuya_auth", tuya_auth);

   
    function tuya_get(config) {
        RED.nodes.createNode(this, config);

        var node = this;
        this.topic = config.topic;
        this.host = config.host;
        this.url = config.url;
        this.topics = {};

        this.on("input", function(msg) {
                var axios = require("axios");
                
                var method= "GET";
                const timestamp = Date.now().toString();
 
                var url = node.url ;
                if (msg.hasOwnProperty("url")){
                    url = msg.url;
                }

                var host = node.host;
                if (msg.hasOwnProperty("host")){
                    host = msg.host;
                }

                var accessKey="";
                if (msg.hasOwnProperty("accessKey")){
                  accessKey = msg.accessKey;
                }
                var secretKey="";
                if (msg.hasOwnProperty("secretKey")){
                  secretKey = msg.secretKey;
                }
                var clientKey="";
                if (msg.hasOwnProperty("clientKey")){
                    clientKey = msg.clientKey;
                }
                
                var answer = getRequestSign(timestamp,clientKey,accessKey,secretKey,url, method, {}, "");

                const headers = {
                    t: timestamp,
                    sign_method: 'HMAC-SHA256',
                    client_id: clientKey,
                    sign:  answer.sign,
                    mode : 'cors',
                    access_token: accessKey,
                    'Content-Type': 'application/json',
                  };
                  msg.headers = headers;
                  var httpClient = axios.create({
                      baseURL: host,
                      timeout: 5 * 1e3,
                    });
                  //node.warn(host + " > "+httpClient);  
                  httpClient.get(url, { headers }).then(res => {
                    
                      msg.payload = res.data;
                      msg.http_success = true;
                  
                      node.send(msg);
                    })
                    .catch(error => {
                      msg.http_success = false;
                      msg.payload = error;
                      node.send(msg)
                    })
              

            
        });
    }

    RED.nodes.registerType("tuya_get", tuya_get);

    function tuya_post(config) {
        RED.nodes.createNode(this, config);

        var node = this;
        this.topic = config.topic;
        this.host = config.host;
        this.body = config.body;
        this.url = config.url;
        this.topics = {};

        this.on("input", function(msg) {
                const timestamp = Date.now().toString();
                var axios = require("axios");
               
                var method= "POST";
 
                var url = node.url ;
                if (msg.hasOwnProperty("url")){
                    url = msg.url;
                }

                var body = node.url ;
                if (msg.hasOwnProperty("body")){
                    body = msg.body;
                }


                var host = node.host;
                if (msg.hasOwnProperty("host")){
                    host = msg.host;
                }

                var accessKey="";
                if (msg.hasOwnProperty("accessKey")){
                  accessKey = msg.accessKey;
                }
                var secretKey="";
                if (msg.hasOwnProperty("secretKey")){
                  secretKey = msg.secretKey;
                }
                var clientKey="";
                if (msg.hasOwnProperty("clientKey")){
                    clientKey = msg.clientKey;
                }
                
                var answer = getRequestSign(timestamp,clientKey,accessKey,secretKey,url, method, {}, body);

                const headers = {
                    t: timestamp,
                    sign_method: 'HMAC-SHA256',
                    client_id: clientKey,
                    sign:  answer.sign,
                    mode : 'cors',
                    access_token: accessKey,
                    'Content-Type': 'application/json',
                  };
                  //msg.headers = headers;
                  //msg.signStr = answer.signStr;
                  var httpClient = axios.create({
                      baseURL: host,
                      timeout: 5 * 1e3,
                    });
                  //node.warn(host + " > "+httpClient);  
                  httpClient.post(url,body, { headers }).then(res => {
                    
                      msg.payload = res.data;
                      msg.http_success = true;
                      node.send(msg);
                    })
                    .catch(error => {
                      msg.http_success = false;
                      msg.payload = error;
                      node.send(msg)
                    })
              

            
        });
    }

    RED.nodes.registerType("tuya_post", tuya_post);

    function tuya_sign(config) {
        RED.nodes.createNode(this, config);

        var node = this;
        this.topic = config.topic;
        this.topics = {};

        this.on("input", function(msg) {
           
                
                var method= "GET";
                if (msg.hasOwnProperty("method")){
                    method = msg.method;
                }
                var url = "" ;
                if (msg.hasOwnProperty("url")){
                    url = msg.url;
                }

                var accessKey="";
                if (msg.hasOwnProperty("accessKey")){
                  accessKey = msg.accessKey;
                }
                var secretKey="";
                if (msg.hasOwnProperty("secretKey")){
                  secretKey = msg.secretKey;
                }
                var clientKey="";
                if (msg.hasOwnProperty("clientKey")){
                    clientKey = msg.clientKey;
                }
                
                var answer = getRequestSign(msg.time,clientKey,accessKey,secretKey,url, method, {}, "");
                msg.payload = answer.sign;
                //msg.querystring = answer.querystring;
                //msg.sortedQuery = answer.sortedQuery;
                node.send(msg);

            
        });
    }

    RED.nodes.registerType("tuya_sign", tuya_sign);


    function TuyaDLocal(config) {
        var node = this;
        node.config = config;
        RED.nodes.createNode(this, config);
    
        let tryReconnect = true;
        let connectInterval = null;
        let statusInterval = null;

        function make_msg(available,event){
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
    
        node.on('close', (removed, done) => {
            disconnectOnClose();
            done();
        });
    
        node.on('input', (msg) => {

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
                              node.tuyaDevice.get({ schema: true });
                          }catch(e){
                            
                             send_msg("catch request failed");
                            
                            }
                        }else{
                          
                            send_msg(`request not made as device disconnected ${node.config.name}` )
                          
                        }
                        break;
                    case 'request1':
                        if (node.tuyaDevice!== undefined && node.tuyaDevice.isConnected()){
                            try{
                                node.tuyaDevice.get({ schema: false });
                            }catch(e){
                               send_msg("catch request1 failed")
                               
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
                        tuyaDevice.on('data', (data, commandByte) => {
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
                                send_msg("already connected")
                                return;
                            }
                            node.status({fill:"red",shape:"dot",text:"finding"});
                            tuyaDevice.find({'options': {'timeout':4000}}).then( () => {
                                node.status({fill:"yellow",shape:"dot",text:"found"});
                                if (delay) {
                                    connectInterval = setTimeout(() => connect(), 5000);
                                } else {
                                    if (tuyaDevice.isConnected()) {
                                       
                                        send_msg("found already connected")
                                        return;
                                    }
                                    node.status({ fill: 'yellow', shape: 'dot', text: 'connecting...' });
                                    tuyaDevice.connect().then(() => { 
                                        send_msg("connect then")
                                    }).catch(() => { 
                                        send_msg("connect catch")
  
                                    });
                                }
                            }, (reason) => { 
                                node.status({fill:"red",shape:"ring",text:"find failed: " + reason + "id:"+tuyaDevice.id+ "ip:"+tuyaDevice.ip});
                                send_msg("connect find")
                            }); 
                           
                        }
                    
 
                    
                        function handleDisconnection() {
                            clearTimeout(statusInterval);
                            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
                            if (tryReconnect) {
                                //node.warn("reconnect following disconnect");
                                connect();
                                // go on to emit message
                            }
                            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
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



    function TuyaMLocal(config) {
        var node = this;
        node.config = config;
      
      
        RED.nodes.createNode(this, config);

        node.tuyaDevices={};
        node.in_msgs={};
    
        node.on('close', (removed, done) => {
            Object.keys(node.tuyaDevices).forEach(function(key) {
                disconnect(node.tuyaDevices[key]);
               
              });
          
            done();
        });

        function send_msg(tuyaDevice,event){
            var msg = make_msg(tuyaDevice,event);
            node.send(msg);
        }
        function make_msg(tuyaDevice,event){
            var msg = {}

            if (tuyaDevice === undefined){
                msg.data = {id: "undefined",available: false, event:event};
                return msg;
            }
            var in_msg;
            if (typeof tuyaDevice === 'string'){
                in_msg = node.in_msgs[tuyaDevice]
            }else{
                in_msg = node.in_msgs[tuyaDevice.device.id];
            }

            if (in_msg !== undefined){
                msg = in_msg;
                msg.called = true;
                //node.warn("delete 788");
                delete node.in_msgs[msg.id];
            }else{
                //node.warn("no message in disconnect");
                msg.called = false;
            }
            var available = tuyaDevice.isConnected();
            if (!available){
                msg.error = event;
            }
            msg.data = { id:tuyaDevice.device.id,  available: available ,event: event };
            return msg;
        }
    
        node.on('input', (msg) => {

            
            if (msg.force === undefined && node.in_msgs[msg.id] !=undefined){
                msg.error = "already processing message "+node.in_msgs[msg.id];
                msg.old = node.in_msgs[msg.id];
                if (msg.timestamp - msg.old.timestamp < 60000){
                    node.send(msg)
                    return;
                }
            }

   
            function disconnect(tuyaDevice) {
                clearTimeout(connectInterval);
                tuyaDevice.tryReconnect = false;
                node.log(`Disconnect request for ${tuyaDevice.device.id}`);
                if (tuyaDevice.isConnected()) {
                    log(`Device connected, disconnecting...`);
                    tuyaDevice.disconnect();
                }

                send_msg(tuyaDevice,"disconnect");
                
            }

            
            var tuyaDevice = node.tuyaDevices[msg.id];

            msg.called = true; // for the dynamic socket we are always called so make sure there is return node info
 
  

            let command = msg.payload;

            if (command != "status"){
                if (msg.id === undefined){

                    node.warn("missing device id");
                    return;
                 }

                if (msg.key === undefined){

                    node.warn("missing device key");
                    return;
                  }
           }else{
                msg.id="status";
           }

            node.in_msgs[msg.id] = msg;


            //node.warn("check command");
            if (typeof command === 'string') {
                switch (command) {
                    case 'request':
                       
                        if (tuyaDevice!== undefined && tuyaDevice.isConnected()){
                          try{
                              tuyaDevice.get({ schema: true });
                          }catch(e){


                             send_msg(tuyaDevice,"request error");
                            
                            }
                        }else{
                            send_msg(tuyaDevice, `request not made as not connected ${msg.id}`);
                          
                        }
                        break;
                    case 'request1':
                        if (tuyaDevice!== undefined && tuyaDevice.isConnected()){
                            try{
                                tuyaDevice.get({ schema: false });
                            }catch(e){
                                send_msg(tuyaDevice,"request1 error");
                               
                              }
                          }else{
                            send_msg(tuyaDevice,`request1 not made as not connected ${msg.id}`);
                             
                          }
                          break;  
                    case 'status'  :
                        var status={};  
                        Object.keys(node.tuyaDevices).forEach(function(key) {
                            var tuyaDevice = node.tuyaDevices[key];
                            status[tuyaDevice.device.id]= {ip: tuyaDevice.device.ip,available: tuyaDevice.isConnected()}
                         });
                       
                         var msg = make_msg("status","status");
                         msg.payload=status;
                         node.send(msg)
                          break;                          
                    case 'connect':{
                        var config = node.config;
        
                        if (msg.reconnect === undefined && node.tuyaDevices[ msg.id] !== undefined){
                            if (node.tuyaDevices[ msg.id].isConnected()){
                                send_msg(tuyaDevice,"already connected");
                                return;
                            }else{
                                tuyaDevice.tryReconnect = false;
                                node.tuyaDevices[ msg.id].disconnect();
                                delete node.tuyaDevices[ msg.id];
                                //node.warn("delete old device");
                               
                            }
                        }
       
                        const tuyaDevice = new TuyaApi({
                            id: msg.id,
                            key: msg.key,
                            ip: msg.ip,
                            version: config.protocolVer
                        });
                        tuyaDevice.tryReconnect = true;
                        tuyaDevice.connectInterval =null;
                        tuyaDevice.statusInterval =null;
                        tuyaDevice.connecting = false;
                        node.tuyaDevices[ msg.id] = tuyaDevice;
                        tuyaDevice.on('connected', () => {
                            //node.log(`Device ${deviceInfo.name} connected!`);
                            clearTimeout(tuyaDevice.connectInterval);
                            tuyaDevice.tryReconnect = false;
                            tuyaDevice.connectInterval =null;
                            tuyaDevice.statusInterval =null;
                            tuyaDevice.connecting=false;
                            //if (config.pollingInterval !== 0) {
                             //   statusInterval = setInterval(() => {
                            //        tuyaDevice.get({ schema: true }).then(() => {}).catch(ex => {
                            //            node.log(`Error while polling status for ${deviceInfo.name}: ${ex.message}`);
                            //        });
                            //    }, config.pollingInterval * 1000);
                            //}
                            node.status({ fill: 'green', shape: 'dot', text: tuyaDevice.device.ip +  ` connected @ ${new Date().toLocaleTimeString()}` });
                            send_msg(tuyaDevice,"connected");
    
                        });
                    
                        tuyaDevice.on('disconnected', () => {
                            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
                            handleDisconnection(tuyaDevice);
                        });
                        tuyaDevice.on('error', (err) => {
                            //node.log(`Device ${deviceInfo.name} in error state: ${err}, reconnect: ${tryReconnect}`);
                            handleDisconnection(tuyaDevice);
                        });
                        tuyaDevice.on('data', (data, commandByte) => {
                            if (commandByte == 8) {
                                //node.warn("proactive");
                                return;
                            }
                            var msg = make_msg(tuyaDevice,true,"data")
                            msg.commandByte = commandByte;
                            msg.payload = data;
                            node.send( msg);

                        }); 
                        function connect(tuyaDevice,delay) {
                            //node.log(`Connecting to ${deviceInfo.name} @ ${deviceInfo.ip} (delay: ${delay ? 'yes' : 'no'})`)
                          
                            clearTimeout(tuyaDevice.connectInterval);
                            clearTimeout(tuyaDevice.statusInterval);
                            if (tuyaDevice.isConnected()) {
                                send_msg(tuyaDevice,"already connected")
                                return;
                            }else if (tuyaDevice.connecting){
                                send_msg(tuyaDevice,"already connecting")  
                                return  
                            }


                            node.status({fill:"red",shape:"dot",text:"finding"});
                            tuyaDevice.connecting=true;
                            tuyaDevice.find({'options': {'timeout':4000}}).then( () => {
                                node.status({fill:"yellow",shape:"dot",text:"found"});
                                if (delay) {
                                    tuyaDevice.connectInterval = setTimeout(() => connect(tuyaDevice), 5000);
                                } else {
                                    if (tuyaDevice.isConnected()) {
                                        send_msg(tuyaDevice,"already connected");
                                        return;
                                    }
                                    node.status({ fill: 'yellow', shape: 'dot', text: 'connecting...' });
                                
                                    tuyaDevice.connect().then(() => { 
                                        send_msg(tuyaDevice,"connect then");
                                        tuyaDevice.connecting=false;
                                       
                                        //node.warn("connect then block")
                                    }).catch((e) => { 
                                        //node.warn("catch connect");
                                        tuyaDevice.connecting=false;
  
                                        send_msg(tuyaDevice,"failed connect");    
                                    });
                                }
                            }, (reason) => { 
                                tuyaDevice.connecting=false;
                                send_msg(tuyaDevice,"find failed");
                                node.status({fill:"red",shape:"ring",text:"find failed: " + reason + "id:"+tuyaDevice.device.id+ "ip:"+tuyaDevice.device.ip});
                            }); 
                           
                        }
                    
 
                    
                        function handleDisconnection(tuyaDevice) {
                            clearTimeout(tuyaDevice.statusInterval);

                            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
                            if (tuyaDevice.tryReconnect) {
                                //node.warn("reconnect following disconnect");
                                connect(tuyaDevice,true);
                            }
                             send_msg(tuyaDevice,"disconnected");
                           
                        } 
                        //
                        //node.warn("call connect");
                        connect(tuyaDevice,0);
                        break;
                    }
                    case 'disconnect':
                        disconnect(tuyaDevice);
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
            } 
        });
    
 
    
    }
	RED.nodes.registerType("tuya-local-msocket",TuyaMLocal);
};


/**
 * HMAC-SHA256 crypto function
 */
 function encryptStr(str, secret) {
  var crypto = require("crypto");
  return crypto.createHmac('sha256', secret).update(str, 'utf8').digest('hex').toUpperCase();
}

/**
 * Request signature, which can be passed as headers
 * @param path
 * @param method
 * @param headers
 * @param body
 */
function getRequestSign( t,clientKey,accessKey,secretKey, path,  method,  headers,  body) {
  var crypto = require("crypto");
  var qs = require("qs");
  
  const [uri, pathQuery] = path.split('?');
  const queryMerged =  qs.parse(pathQuery);
  var sortedQuery= {};
  Object.keys(queryMerged)
    .sort()
    .forEach((i) => (sortedQuery[i] = queryMerged[i]));

  const querystring = decodeURIComponent(qs.stringify(sortedQuery));
  
  const url = querystring ? `${uri}?${querystring}` : uri;
  //const contentHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const contentHash = crypto.createHash('sha256').update(body).digest('hex');
  const stringToSign = [method, contentHash, '', url].join('\n');
  const signStr = clientKey + accessKey + t + stringToSign;
  return  {
      sign: encryptStr(signStr, secretKey)
      //signStr: signStr,
      //sortedQuery: sortedQuery
  }

}

/**
 * Request signature, which can be passed as headers
 * @param path
 * @param method
 * @param headers
 * @param body
 */
 function getRequestAuth( t,clientKey,secretKey, path,  method,  headers,  body) {
    var crypto = require("crypto");
    var qs = require("qs");
    
    const [uri, pathQuery] = path.split('?');
    const queryMerged =  qs.parse(pathQuery);
    var sortedQuery= {};
    Object.keys(queryMerged)
      .sort()
      .forEach((i) => (sortedQuery[i] = queryMerged[i]));
  
    const querystring = decodeURIComponent(qs.stringify(sortedQuery));
    
    const url = querystring ? `${uri}?${querystring}` : uri;
    //const contentHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const contentHash = crypto.createHash('sha256').update(body).digest('hex');
    const stringToSign = [method, contentHash, '', url].join('\n');
    const signStr = clientKey  + t + stringToSign;
    return  {
        sign: encryptStr(signStr, secretKey),
        signStr: signStr,
        sortedQuery: sortedQuery
    }
  
  }
