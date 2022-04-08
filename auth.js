

module.exports = function(RED) {
    "use strict";

  

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
                var query = "";;
                if (msg.hasOwnProperty("query")){
                    url = msg.query;
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
                msg.payload =  getRequestSign(clientKey,accessKey,secretKey,url, method, {}, query,"");

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
 * @param query
 * @param body
 */
function getRequestSign( clientKey,accessKey,secretKey, path,  method,  headers,  query,  body) {
  var crypto = require("crypto");
  var qs = require("qs");
  const t = Date.now().toString();
  const [uri, pathQuery] = path.split('?');
  const queryMerged = Object.assign(query, qs.parse(pathQuery));
  var sortedQuery= {};
  Object.keys(queryMerged)
    .sort()
    .forEach((i) => (sortedQuery[i] = query[i]));

  const querystring = decodeURIComponent(qs.stringify(sortedQuery));
  const url = querystring ? `${uri}?${querystring}` : uri;
  const contentHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const stringToSign = [method, contentHash, '', url].join('\n');
  const signStr = clientKey + accessKey + t + stringToSign;
  return {
    t,
    path: url,
    client_id: clientKey,
    sign: encryptStr(signStr, secretKey),
    sign_method: 'HMAC-SHA256',
    access_token: clientKey,
    stringToSign: stringToSign,
    signStr: signStr
  };
}

