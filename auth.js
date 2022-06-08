
const { notDeepStrictEqual } = require('assert');
const { cp } = require('fs');
const { maxHeaderSize } = require('http');
const { send } = require('process');

module.exports = function(RED) {
    "use strict";
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
                node.warn(answer.sign);
                node.warn(clientKey);
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
