We need a webservice that allows for linking a Minecraft profile to a smto.dev account.  
The smto.dev account auth portion has been finished, and the project exists at `../smto-account/system`.  
Also take a look at `https://smto.dev/account/oauth/.well-known/openid-configuration` for more information.  

smto.dev is a Minecraft server network.  
The purpose of this service is to collect statistics across servers, so users can view those.  
In the future, this could also allow us to fun features such as rewards and achievements.  
    
We also need an admin area for the following:
- API token generation and revokation
- Setting up server metadata, should be publically available via the API without a token (id, icon, name, state (active,archived,upcoming), optional launch date, optional current version, optional description), should be extensible in the future as well as we migrate existing systems to this (we have a custom mc launcher that would benefit from this data as well, currently we just edit json files by hand, like this one: `https://smto.dev/mc/launcher/v2/pack-i5.json`. Launcher source for reference at `../smto-launcher-v2`)

Now, please create a linking service that:  
- Has a modern, yet playful design (like minecraft)
- Has a login page, using the above OAuth path (smto.dev account). No other account types are supported.  
- Allows for linking a Minecraft profile automatically (what is the best way to do this, Microsoft login? Needs to be a verified profile; MC Username input is not...)
- Allows for unlinking as well
- After login and linking, shows a dashboard of stats, and the player skin in 3d
- Has an API for our server plugins, so that those can post user statistics
- The API should be authenticated using tokens
- API needs to be easily extendible in the future. For now:
  - Playtime for each server (servers use internal IDs that we can use for this, for example the current flagship has the id `i5`). Our plugins already collect playtime locally, so just an api to post the latest recorded total playtime would be enough
