import express from 'express';
import swaggerUi from 'swagger-ui-express'
import { routes, generateOpenApiSpec } from './info';

const app = express();

// Generate the OpenAPI specification
const openApiSpec = generateOpenApiSpec(routes);

// Serve Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Swagger UI is available at http://localhost:${PORT}/api-docs`);
});