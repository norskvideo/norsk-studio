# Norsk Studio Defaults

To work with this repo

```
npm install --include=dev
npm run build
npm run server
```

Will launch a default instance of Norsk Studio on port 8000 (http://localhost:8000) with the built-in components and vision director. It is assumed Norsk is running on localhost on the standard ports. 

That can be changed under workspaces/studio-default/config.yaml

```
npm run test 
```

Will run the tests against all of the workspaces in the project (Again, assuming that Norsk is running)


Locations of interest
--

*workspaces/built-ins* 

Contains a collection of the default components available for use within Studio. 
Its package.json builds a manifest for everything found in 'src' in src/index.ts, as well as building a client-side bundle for all of them.

*workspaces/vision-director*

Contains a single component that is manually registered in src/index.ts, as well as building a client-side bundle for everything required to run it.

*workspaces/studio-default*

This is what you would start with when working against Norsk Studio, an empty project that depends on

- Norsk Studio
- Built-ins
- Vision Director

You can then add your own components to this list by adding them as a dependency and including them in your config.yaml

More extensive documentation will be forthcoming in the following weeks.
