
const TuyaDev = require('tuyapi');
const {keyRename,getHumanTimeStamp,checkValidJSON,filterCommandByte} = require('./lib/utils');

module.exports = function(RED) {
    "use strict";
    function TuyaNode(config) {
		RED.nodes.createNode(this,config);
		var node = this;
		var set_timeout = true
		this.Name = config.devName;
		this.Id = config.devId;
		this.Key = config.devKey;
		this.Ip = config.devIp;
		this.version = config.protocolVer;
		this.renameSchema = config.renameSchema;
		this.filterCB = config.filterCB;
		const dev_info =  {name:this.Name,ip:this.Ip,id:this.Id};
		const device = new TuyaDev({
			id: this.Id,
			key: this.Key,
			ip: this.Ip,
			version: this.version});

		function connectToDevice(timeout,req) {
			device.find({'options': {'timeout':timeout}}).then( () => {
				node.status({fill:"yellow",shape:"dot",text:"connecting"});
				node.log(req);
				device.connect().then( () => {
				}, (reason) => { 
					node.status({fill:"red",shape:"ring",text:"failed: " + reason});
				});
			});
		}

		function disconnectDevice(deleted) {
			set_timeout = deleted ? false : true;
			device.disconnect();
		}
// 
		function setDevice(req) {
 
			if ( req == "request" ) {
				device.get({"schema":true});
			} else if ( req == "connect" ) {
				// node.log('Connection requested by input');
				connectToDevice(10,'Connection requested by input for device: ' + this.Name );
			} else if ( req == "disconnect" ) {
				node.log("Disconnection requested by input for device: " + this.Name)
				device.disconnect();
			} else if (req == "toggle") {
				device.toggle();
			} else if ( typeof req == "boolean" ) {
				device.set({set: req}).then( () => {
					node.status({fill:"green",shape:"dot",text: 'set success at:' + getHumanTimeStamp()});
				}, (reason) => {
					node.status({fill:"red",shape:"dot",text: 'set state failed:' + reason});
				});
			} else if ( "dps" in req ) {
				console.log(req)
				device.set(req);
			} else if ( "multiple" in req) {
				device.set({
					multiple:true,
					data: req.data
				});
			}
		}


		connectToDevice(10,'Deploy connection request for device ' + this.Name);


		device.on('disconnected', () => {
			this.status({fill:"red",shape:"ring",text:"disconnected from device"});
			dev_info.available = false
           //return;
			var msg = {data:dev_info}
			node.send(msg);
			if (set_timeout) {
				var timeout = setTimeout(connectToDevice, 10000, 10, 'set timeout for re-connect');
			}
		});


		device.on('connected', () => {
			this.status({fill:"green",shape:"dot",text: device.device.ip + " at " + getHumanTimeStamp()});
			try	{
				clearTimeout(timeout)	
			} catch(e) {
				node.log("No timeout defined for " + this.Name + ", probably NodeRED starting")
			}
			
		});

		device.on('error', error => {
			this.status({fill:"red",shape:"ring",text:"error: " + error});
			node.warn(error + " device: " + this.Name);
			if (error.toString().includes("Error from socket")){
				try	{
					node.log("error: Trying to clear a possible timeout timer for device " + this.Name )
					clearTimeout(timeout)	
				} catch(e) {
					node.log("error: No timeout defined, device " + this.Name + " is probably not powered")
				}
			}
		});

		device.on('data', (data,commandByte) => {
			if ("commandByte" !== null ) {
                
				dev_info.available = true;
				if (this.renameSchema !== undefined || this.renameSchema !== null) {

                    try{
					    data.dps = checkValidJSON(this.renameSchema) ? keyRename(data.dps,JSON.parse(this.renameSchema)) : data.dps;
                    }catch(e){
                        node.log("looks like a bad key " + this.Name + " is probably got the wrong key")
                        return
                    }
				}
				var msg = {data:dev_info,commandByte:commandByte,payload:data};
				if (this.filterCB !== "") {
					node.send(filterCommandByte(msg,this.filterCB));
				} else {
					node.send(msg);
				}
			}
		});

		node.on('input', function(msg) {
			setDevice(msg.payload);
		});


		this.on('close', function(removed, done) {
			if (removed) {
				  // This node has been deleted disconnect device and not set a timeout for reconnection
				node.log("Node removal, gracefully disconnect device: " + this.Name);
				device.isConnected() ? disconnectDevice(true) : node.log("Device " + this.Name + "not connected on removal");
			} else {
				// this node is being restarted, disconnect the device gracefully or connection will fail. Do not set a timeout
				node.log("Node de-deploy, gracefully disconnect device: " + this.Name);
				device.isConnected() ? disconnectDevice(true) : node.log("Device " + this.Name + "not connected on re-deploy");
			}
			done();
		});
// 
	}
	RED.nodes.registerType("tuya-local-socket",TuyaNode);

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
