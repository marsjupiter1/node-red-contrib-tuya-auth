
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
            node.status({fill:"red",shape:"dot",text:"finding"});
  
            tuyaDevice.find({'options': {'timeout':2000}}).then( () => {
                node.status({fill:"yellow",shape:"dot",text:"found"});
                if (delay) {
                    connectInterval = setTimeout(() => connect(), 5000);
                } else {
                    if (tuyaDevice.isConnected()) {
                        node.log(`Device ${deviceInfo.name} already connected.`);
                        return;
                    }
                    node.status({ fill: 'yellow', shape: 'dot', text: 'connecting...' });
                    tuyaDevice.connect().then(() => { }).catch(() => { });
                }
            }, (reason) => { 
                node.status({fill:"red",shape:"ring",text:"failed: " + reason});
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
            node.send({ data: {  deviceinfo:deviceInfo, available: false } });
        }
    
        function handleDisconnection() {
            clearTimeout(statusInterval);
            //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
            if (tryReconnect) {
                //node.warn("reconnect following disconnect");
                connect(true);
            }
            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
            node.send({ data: { deviceinfo: deviceInfo, available: false } });
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
            node.send({ data: {  deviceinfo:deviceInfo, available: true } });
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
            if (commandByte) {
                node.send( msg);
            }
        });
    
        node.on('input', (msg) => {
            node.in_msg = msg;
            let command = msg.payload;
            if (typeof command === 'string') {
                switch (command) {
                    case 'request':
                        tuyaDevice.get({ schema: true });
                        break;
                    case 'request1':
                        tuyaDevice.get({ schema: false });
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
    
     
    

    
        node.on('input', (msg) => {
            function connect(delay) {
                //node.log(`Connecting to ${deviceInfo.name} @ ${deviceInfo.ip} (delay: ${delay ? 'yes' : 'no'})`)
                clearTimeout(connectInterval);
                clearTimeout(statusInterval);
                node.status({fill:"red",shape:"dot",text:"finding"});
      
                tuyaDevice.find({'options': {'timeout':2000}}).then( () => {
                    node.status({fill:"yellow",shape:"dot",text:"found"});
                    if (delay) {
                        connectInterval = setTimeout(() => connect(), 5000);
                    } else {
                        if (tuyaDevice.isConnected()) {
                            node.log(`Device ${deviceInfo.name} already connected.`);
                            return;
                        }
                        node.status({ fill: 'yellow', shape: 'dot', text: 'connecting...' });
                        tuyaDevice.connect().then(() => { }).catch(() => { });
                    }
                }, (reason) => { 
                    node.status({fill:"red",shape:"ring",text:"failed: " + reason});
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
                node.send({ data: {  deviceinfo:deviceInfo, available: false } });
            }
        
            function handleDisconnection() {
                clearTimeout(statusInterval);
                //node.log(`Device ${deviceInfo.name} disconnected, reconnect: ${tryReconnect}`);
                if (tryReconnect) {
                    //node.warn("reconnect following disconnect");
                    connect(true);
                }
                node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
                node.send({ data: { deviceinfo: deviceInfo, available: false } });
            }
        

            const tuyaDevice = new TuyaApi({
                id: config.devId,
                key: config.devKey,
                ip: config.devIp,
                version: config.protocolVer
            });

            node.on('close', (removed, done) => {
                disconnect();
                done();
            });
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
                node.send({ data: {  deviceinfo:deviceInfo, available: true } });
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
                if (commandByte) {
                    node.send( msg);
                }
            });      
            let tryReconnect = true;
            let connectInterval = null;
            let statusInterval = null;
            let deviceInfo = { ip: config.devIp, name: config.devName, id: config.devId };
            node.in_msg = msg;
            let command = msg.payload;
            if (typeof command === 'string') {
                switch (command) {
                    case 'request':
                        tuyaDevice.get({ schema: true });
                        break;
                    case 'request1':
                        tuyaDevice.get({ schema: false });
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
    
 
    
    }
	RED.nodes.registerType("tuya-local-dsocket",TuyaDLocal);
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
