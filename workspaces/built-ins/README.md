## Built-ins Directory

This built-ins directory contains a collection of the default components available for use within Studio.
Its `package.json` builds a manifest for everything found in `src` in `src/index.ts`, as well as building a client-side bundle for all of them.

### Structure

Inside the `src` folder, we have several subdirectories each containing components in a particular class:

- **Inputs**: Modules that define how media streams are ingested.
- **Outputs**: Modules that define how media streams are delivered to their destinations.
- **Processors**: Modules that handle the transformation or analysis of media streams.

Using Norsk Studio, we can combine these components to easily build even complex live media workflows.

The documentation for each of the components can be found within the component's folder Readme.
