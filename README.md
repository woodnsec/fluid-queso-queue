[![Node.js CI](https://github.com/liquidnya/fluid-queso-queue/actions/workflows/node.js.yml/badge.svg?branch=main)](https://github.com/liquidnya/fluid-queso-queue/actions/workflows/node.js.yml)

These are the steps necessary to make sure your bot is authorized to perform the
actions it needs to.  Each step will assist in filling out one of the variables
located in `settings.js`.

PRIVACY WARNING
The code on this site is public by default. When you make changes to this
template you will get your own url. If someone figures out what your url is, 
they will be able to find your OAuth password. This is not a good thing.
Personally I would recommend using another code host like AWS Cloud 9, but
that is more difficult to set up. If you continue to use this, make sure
you DO NOT share the url.


Step 1: Create the Bot's Twitch Account (optional*)

Go through the standard steps of creating a new Twitch account.
This process should get you the username.  

* (If you would rather have the bot act as you, you can skip 
this step and use your own username)


Step 2: Get the Twitch Chat OAuth Password

There are more proper ways to do this, but they are too complex.  Let's
just use this workaround.  Make sure you are logged into the bot's account for
this step (or your own account if you want the bot to pretend to be you).

url: https://twitchapps.com/tmi/
This will get you the value for the password you'll need to access chat. Copy
everything, including the 'oath:' part.


Step 3: Fill out the rest

The channel name is the channel you want to run this bot on.