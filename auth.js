

module.exports = function(RED) {
    "use strict";

    function tuya_auth(config) {
        RED.nodes.createNode(this, config);

        var node = this;
        this.topic = config.topic;
        this.topics = {};

        this.on("input", function(msg) {
                var axios = require("axios")
                const signUrl = '/v1.0/token?grant_type=1';
                const timestamp = Date.now().toString();
                var input = Number(msg.payload);
                var host = node.host;
                if (msg.hasOwnProperty("host")){
                    host = msg.host;
                }
                var url = host+signUrl;

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
               
               
                const contentHash = crypto.createHash('sha256').update('').digest('hex');
                const stringToSign = [method, contentHash, '', signUrl].join('\n');
                const signStr = config.accessKey + timestamp + stringToSign;
              
                const headers = {
                  t: timestamp,
                  sign_method: 'HMAC-SHA256',
                  client_id: accessKey,
                  sign: await encryptStr(signStr, secretKey),
                };

                httpClient = axios.create({
                    baseURL: host,
                    timeout: 5 * 1e3,
                  });
                const { data: login } = await httpClient.get(signUrl, { headers });
                if (!login || !login.success) {
                  throw Error(`Authorization Failed: ${login.msg}`);
                }
                msg.payload = login.result;
                
                node.send(msg);

            
        });
    }

    RED.nodes.registerType("tuya_sign", tuya_auth);

    //var axios = require("axios");
    function tuya_sign(config) {
        RED.nodes.createNode(this, config);

        var node = this;
        this.topic = config.topic;
        this.topics = {};

        this.on("input", function(msg) {
           
                var input = Number(msg.payload);
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
      //querystring: querystring,
      //sortedQuery: sortedQuery
  }

}

