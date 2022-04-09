# node-red-contrib-tuya-auth
This aims a being a set of node red nodes for accessing tuya. 

At the moment it is limited to:

node tuya-sign which can be used if you want a customised httpRequest you make your self

node tuya-auth which obtains access tokens

node tuya-get signs and makes a tuya http get request

node tuya-post signs and makes a tuya http post request

All keys and currently parameters need to be passed to the node. 

In practical use you'd create a flow with a link-call that populates your secret data.

See the flows files for example usage
