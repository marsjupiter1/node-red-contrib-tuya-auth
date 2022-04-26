# node-red-contrib-tuya-auth
This aims a being a set of node red nodes for accessing tuya. 

At the moment it is limited to:

node tuya-sign which can be used if you want a customised httpRequest you make your self

node tuya-auth which obtains access tokens

node tuya-get signs and makes a tuya http get request

node tuya-post signs and makes a tuya http post request

node tuya-socket that communicates with tuya devices directly on the local area network not using the cloud service. Note some devices use encryption some don't, if you see "data format engine" change the version 3.3 in the nodes dialog to 3.1 which encrypts only on send.


node tuya-dsocket is a variant on node tuya-socket that allows you to override localkey (key), device id (is) and device ip (ip) in the msg. It's a variant and not a replacement in that to use it, you have to send it a "connect" message before it will connect. So it's slightly more complex to use, but it does allow you to remove your secrets from individual nodes into a common setup node.

In practical use you'd create a sub flow for the post and get requests that populates the secret data and will try and auth again if there is an error.

See the flows files for example usage
