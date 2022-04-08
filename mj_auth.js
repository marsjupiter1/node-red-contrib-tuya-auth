import * as qs from 'qs';
import * as crypto from 'crypto';
import { default as axios } from 'axios';

module.exports = function(RED) {
    "use strict";

    function tuya_auth(config) {
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
                var secretkey="";
                if (msg.hasOwnProperty("secretkey")){
                  secretkey = msg.secretkey;
                }
                msg.payload =  getRequestSign(accessKey,secretKey,url, method, {}, query);;

                node.send(msg);

            
        });
    }

    RED.nodes.registerType("tuya_sign", tuya_sign);
};


/**
 * HMAC-SHA256 crypto function
 */
 function encryptStr(str, secret) {
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
function getRequestSign( accessKey,secretKey, path,  method,  headers,  query,  body) {
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
  const signStr = accessKey + token + t + stringToSign;
  return {
    t,
    path: url,
    client_id: accessKey,
    sign: await encryptStr(signStr, secretKey),
    sign_method: 'HMAC-SHA256',
    access_token: token,
  };
}

