
const { cp } = require('fs');
const { maxHeaderSize } = require('http');
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
                    tuyaDevice.connect().then(() => { }).catch(() => { 
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
            clearTimeout(statusInterval);
            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
            if (tryReconnect) {
                //node.warn("reconnect following disconnect");
                connect(true);
            }


            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
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
    
     
    
        node.on('close', (removed, done) => {
            disconnectOnClose();
            done();
        });
    
        node.on('input', (msg) => {

        
            



            function disconnectOnClose() {
                clearTimeout(connectInterval);
                tryReconnect = false;
                node.log(`Disconnect on close request for ${deviceInfo.name}`);
                if (node.tuyaDevice.isConnected()) {
                    node.log(`Device connected, disconnecting...`);
                    node.tuyaDevice.disconnect();
                }
            }

            function disconnect() {
                clearTimeout(connectInterval);
                tryReconnect = false;
                node.log(`Disconnect request for ${deviceInfo.name}`);
                if (node.tuyaDevice.isConnected()) {
                    node.log(`Device connected, disconnecting...`);
                    node.tuyaDevice.disconnect();
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
                msg.data = {  deviceinfo:deviceInfo, available: false,event:"disconnect" };
                node.send(msg);
                
            }
            config = node.config;
            let tryReconnect = true;
            let connectInterval = null;
            let statusInterval = null;
            let deviceInfo = { ip: config.devIp, name: config.devName, id: config.devId };
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
                             msg.error = e;
                             msg.data = {  deviceinfo:deviceInfo, available: false,event:"request" };
                             node.send(msg);
                            
                            }
                        }else{
                            msg.error = `request not made as not connected ${deviceInfo.name}`;
                            msg.data = {  deviceinfo:deviceInfo, available: false,event:"request not made a device disconnected" };

                            node.send(msg);
                          
                        }
                        break;
                    case 'request1':
                        if (node.tuyaDevice!== undefined && node.tuyaDevice.isConnected()){
                            try{
                                node.tuyaDevice.get({ schema: false });
                            }catch(e){
                               msg.error = e;
                               msg.data = {  deviceinfo:deviceInfo, available: false,event:"request1" };
 
                               node.send(msg);
                               
                              }
                          }else{
                              msg.error = `request not made as not connected ${deviceInfo.name}`;
                              msg.data = {  deviceinfo:deviceInfo, available: false,event:"request1 not made a device disconnected" };
                              node.send(msg);
                             
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
                            var msg = {}
                            if ("in_msg" in node){
                                msg = node.in_msg;
                                msg.called = true;
                                delete node.in_msg;
                            }else{
                                msg.called = false;
                            }
                            msg.data = {  deviceinfo:deviceInfo, available: true,event: "connected" }
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
                        tuyaDevice.on('data', (data, commandByte) => {
                            var msg = {}
                            if ("in_msg" in node){
                                msg = node.in_msg;
                                delete node.in_msg;
                            }else{
                                msg.called = false;
                            }
                            //node.warn(data);
                            msg.data = {deviceInfo, available: true, event: "data" };
                            msg.commandByte = commandByte;
                            msg.payload = data;
                            if (commandByte) {
                                node.send( msg);
                               
                            }
                        }); 
                        function connect(delay) {
                            //node.log(`Connecting to ${deviceInfo.name} @ ${deviceInfo.ip} (delay: ${delay ? 'yes' : 'no'})`)
                            clearTimeout(connectInterval);
                            clearTimeout(statusInterval);
                            node.status({fill:"red",shape:"dot",text:"finding"});
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
                                //node.warn(data);
                                msg.data = { id: tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: true, event:"already connect" };
                                msg.payload = data;
                                node.send( msg); 
                                return;
                            }
                            tuyaDevice.find({'options': {'timeout':4000}}).then( () => {
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
                                        //node.warn(data);
                                        msg.data = { id: tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: true };
                                        msg.payload = data;
                                        node.send( msg); 
                                        return;
                                    }
                                    node.status({ fill: 'yellow', shape: 'dot', text: 'connecting...' });
                                    tuyaDevice.connect().then(() => { }).catch(() => { 
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
                                        msg.error = "catch failed connect";
                                        msg.data = { id: tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: false,event: "already connected"};
                                        msg.payload = data;
                                        node.send( msg); 
                                    });
                                }
                            }, (reason) => { 
                                node.status({fill:"red",shape:"ring",text:"find failed: " + reason + "id:"+tuyaDevice.id+ "ip:"+tuyaDevice.ip});
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
                                 msg.error = "catch failed find";
                                 msg.data = { id: tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: false,event: "find failed"};
                                 msg.payload = data;
                                 node.send( msg); 
                            }); 
                           
                        }
                    
 
                    
                        function handleDisconnection() {
                            clearTimeout(statusInterval);
                            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
                            if (tryReconnect) {
                                //node.warn("reconnect following disconnect");
                                connect(true);
                            }
                            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
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
                            msg.error = "catch failed find";
                            msg.data = { deviceinfo: deviceInfo, available: false ,event:"disconnection"}
                            msg.payload = data;
                            node.send( msg); 
                          
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
                node.log(`Unknown command for ${deviceInfo.name}: ${command}`);
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
                    node.log(`Disconnected`);
                }
                var msg = {}
                var in_msg = node.in_msgs[tuyaDevice.device.id];
                if (in_msg !== undefined){
                    msg = in_msg;
                    msg.called = true;
                    //node.warn("delete 788");
                    delete node.in_msgs[msg.id];
                }else{
                    //node.warn("no message in disconnect");
                    msg.called = false;
                }
                msg.data = { id:tuyaDevice.device.id,  available: false,event: "disconnect" };
                node.send(msg);
                
            }

            
            var tuyaDevice = node.tuyaDevices[msg.id];
            if (tuyaDevice !== undefined){
                tuyaDevice.tryReconnect = true;
                tuyaDevice.connectInterval =null;
                tuyaDevice.statusInterval =null;
            }
            msg.called = true; // for the dynamic socket we are always called so make sure there is return node info
 
            node.in_msgs[msg.id] = msg;


            let command = msg.payload;

            if (command != "status"){
                if (msg.id === undefined){
                    delete node.in_msgs[msg.id];
                 node.warn("missing device id");
                    return;
                 }

                if (msg.key === undefined){
                    delete node.in_msgs[msg.id];
                    node.warn("missing device id");
                    return;
                  }
            }

            //node.warn("check command");
            if (typeof command === 'string') {
                switch (command) {
                    case 'request':
                       
                        if (tuyaDevice!== undefined && tuyaDevice.isConnected()){
                          try{
                              tuyaDevice.get({ schema: true });
                          }catch(e){
                             msg.error = e;
                             msg.data = { id: msg.id,  available: false, event: "request1 error" }
                             //delete(node.tuyaDevices[ msg.id]);
                             //node.warn("delete 839");
                             delete node.in_msgs[msg.id];
                             node.send(msg);
                            
                            }
                        }else{
                            msg.error = `request not made as not connected ${msg.id}`;
                            msg.data = { id: msg.id,  available: false, event: "request not connected" };
                           // node.warn("delete 846");
                            delete node.in_msgs[msg.id];
                            node.send(msg);
                          
                        }
                        break;
                    case 'request1':
                        if (tuyaDevice!== undefined && tuyaDevice.isConnected()){
                            try{
                                tuyaDevice.get({ schema: false });
                            }catch(e){
                               msg.error = e;
                               msg.data = { id: msg.id,  available: false, event: "request1 error" };
                               //node.warn("delete 859");
                               delete node.in_msgs[msg.id];
                               node.send(msg);
                               
                              }
                          }else{
                              msg.error = `request not made as not connected ${msg.id}`;
                              msg.data = { id: msg.id,  available: false, event: "request1 not connected" }
                              //node.warn("delete 865");
                              delete node.in_msgs[msg.id];
                              node.send(msg);
                             
                          }
                          break;  
                    case 'status'  :
                        var status={};  
                        Object.keys(node.tuyaDevices).forEach(function(key) {
                            var tuyaDevice = node.tuyaDevices[key];
                            status[tuyaDevice.device.id]= {ip: tuyaDevice.device.ip,available: tuyaDevice.isConnected()}
                         });
                         msg.payload=status;
                         //node.warn("delete 877");
                         delete node.in_msgs[msg.id];
                         node.send(msg);
                          break;                          
                    case 'connect':{
                        var config = node.config;
        
                        if (msg.reconnect === undefined && node.tuyaDevices[ msg.id] !== undefined){
                            if (node.tuyaDevices[ msg.id].isConnected()){
                                msg.data = { id: msg.id,  available: true, event:"already connected" }
                                //node.warn("delete 886");
                                delete node.in_msgs[msg.id];
                                node.send(msg)
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
                        node.tuyaDevices[ msg.id] = tuyaDevice;
                        tuyaDevice.on('connected', () => {
                            //node.log(`Device ${deviceInfo.name} connected!`);
                            clearTimeout(tuyaDevice.connectInterval);
                            tuyaDevice.tryReconnect = false;
                            tuyaDevice.connectInterval =null;
                            tuyaDevice.statusInterval =null;
                            //if (config.pollingInterval !== 0) {
                             //   statusInterval = setInterval(() => {
                            //        tuyaDevice.get({ schema: true }).then(() => {}).catch(ex => {
                            //            node.log(`Error while polling status for ${deviceInfo.name}: ${ex.message}`);
                            //        });
                            //    }, config.pollingInterval * 1000);
                            //}
                            node.status({ fill: 'green', shape: 'dot', text: tuyaDevice.device.ip +  ` connected @ ${new Date().toLocaleTimeString()}` });
                            var msg = {}
                            var in_msg = node.in_msgs[tuyaDevice.device.id];
                            if (in_msg !== undefined){
                                msg = in_msg;
                                msg.called = true;
                                //node.warn("delete 921");
                                delete node.in_msgs[msg.id];
                            }else{
                                //node.warn("no message in connected");
                                msg.called = false;
                            }
                            msg.data = { id: tuyaDevice.device.id,ip:tuyaDevice.device.ip,   available: true, event: "connected" }
                            node.send(msg);
    
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
                            if (commandByte == 7) {
                                //node.warn("proactive");
                                return;
                            }
                            var msg = {}
                            var in_msg = node.in_msgs[tuyaDevice.device.id];
                            if (in_msg !== undefined){
                                msg = in_msg;
                                msg.called = true;
                                //node.warn("delete 951");
                                delete node.in_msgs[msg.id];
                            }else{
                                //node.warn("no message in data");
                                msg.called = false;
                            }
                            //node.warn(data);
                            msg.data = { id: tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: true, event: "data" };
                            msg.commandByte = commandByte;
                            msg.payload = data;

                            if (commandByte) {
                                node.send( msg);
                               
                            }
                        }); 
                        function connect(tuyaDevice,delay) {
                            //node.log(`Connecting to ${deviceInfo.name} @ ${deviceInfo.ip} (delay: ${delay ? 'yes' : 'no'})`)
                          
                            clearTimeout(tuyaDevice.connectInterval);
                            clearTimeout(tuyaDevice.statusInterval);
                            node.status({fill:"red",shape:"dot",text:"finding"});
                            if (tuyaDevice.isConnected()) {
                                var msg = {}
                                var in_msg = node.in_msgs[tuyaDevice.device.id];
                                if (in_msg !== undefined){
                                    msg = in_msg;
                                    msg.called = true;
                                    //node.warn("delete 983");
                                    delete node.in_msgs[msg.id];
                                }else{
                                    node.warn("no message in connect already connected");
                                    msg.called = false;
                                }
                                //node.warn(data);
                                msg.data = { id: tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: true,event:"already connected" };
                                msg.payload = data;
                                node.send( msg);    
                                return;
                            }
                            tuyaDevice.find({'options': {'timeout':4000}}).then( () => {
                                node.status({fill:"yellow",shape:"dot",text:"found"});
                                if (delay) {
                                    tuyaDevice.connectInterval = setTimeout(() => connect(tuyaDevice), 5000);
                                } else {
                                    if (tuyaDevice.isConnected()) {
                                        var msg = {}
                                        var in_msg = node.in_msgs[tuyaDevice.device.id];
                                        if (in_msg !== undefined){
                                            msg = in_msg;
                                            msg.called = true;
                                            //node.warn("delete 983");
                                            delete node.in_msgs[msg.id];
                                        }else{
                                            node.warn("no message in connect already connected");
                                            msg.called = false;
                                        }
                                        //node.warn(data);
                                        msg.data = { id: tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: true,event:"already connected" };
                                        msg.payload = data;
                                        node.send( msg);    
                                        return;
                                    }
                                    node.status({ fill: 'yellow', shape: 'dot', text: 'connecting...' });
                                    tuyaDevice.connect().then(() => { 
                                        var msg = {}
                                        var in_msg = node.in_msgs[tuyaDevice.device.id];
                                        if (in_msg !== undefined){
                                            msg = in_msg;
                                            msg.called = true;
                                            //node.warn("delete 1000");
                                            delete node.in_msgs[msg.id];
                                        }else{
                                            //node.warn("no message in connect then");
                                            msg.called = false;
                                        }
                                        //node.warn(data);
                                        msg.error = "connect then";
                                        msg.data = { id: tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: true, event:"cpnnect then" };

                                        node.send( msg); 
                                        //node.warn("connect then block")
                                    }).catch(() => { 
                                        //node.warn("catch connect");
                                        var msg = {}
                                        var in_msg = node.in_msgs[tuyaDevice.device.id];
                                        if (in_msg !== undefined){
                                            msg = in_msg;
                                            msg.called = true;
                                            //node.warn("delete 1019");
                                            delete node.in_msgs[msg.id];
                                        }else{
                                            //node.warn("no message catch connect");
                                            msg.called = false;
                                        }
                                        //node.warn(data);
                                        msg.error = "catch: failed connect";
                                        msg.data = { id: tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: true, event:"connect catch" };

                                        node.send( msg);    
                                    });
                                }
                            }, (reason) => { 
                                var msg = {}
                                var in_msg = node.in_msgs[tuyaDevice.device.id];
                                if (in_msg !== undefined){
                                    msg = in_msg;
                                    msg.called = true;
                                    //node.warn("delete 1037");
                                    delete node.in_msgs[msg.id];
                                }else{
                                    //node.warn("no message catch find");
                                    msg.called = false;
                                }
                                //node.warn(data);
                                msg.error = "find failed";
                                msg.data = { id: tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: true,event:"connect catch find" };
                                node.send( msg);    
                                node.status({fill:"red",shape:"ring",text:"find failed: " + reason + "id:"+tuyaDevice.device.id+ "ip:"+tuyaDevice.device.ip});
                            }); 
                           
                        }
                    
 
                    
                        function handleDisconnection(tuyaDevice) {
                            clearTimeout(tuyaDevice.statusInterval);
                            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
                            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
                            var msg = {}
                            var in_msg = node.in_msgs[tuyaDevice.device.id];
                            if (in_msg !== undefined){
                                msg = in_msg;
                                msg.called = true;
                                //node.warn("delete 1075");
                                delete node.in_msgs[msg.id];
                            }else{
                                //node.warn("no message catch handle disconnect");
                                msg.called = false;
                            }
                            msg.data = { id:tuyaDevice.device.id,ip: tuyaDevice.device.ip, available: false }
                            node.send(msg);
  
                            if (tuyaDevice.tryReconnect) {
                                //node.warn("reconnect following disconnect");
                                connect(tuyaDevice,true);
                            }
                         
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
