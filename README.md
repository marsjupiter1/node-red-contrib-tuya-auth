# node-red-contrib-tuya-auth
This aims a being a set of node red nodes for accessing tuya. 

At the moment it is limited to:

node tuya-sign which can be used in the flow flow.json

node tuya-auth which obtains access tokens

node tuya-get signs and makes a tuya get request

All keys and currently parameters need to be passed to the node. 

In practical use you'd create a flow with a link-call that populates your secret data.
