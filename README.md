![LabelZoom Logo](./docs/LabelZoom_Logo_f_400px.png)

# labelzoom-cf-api-gateway

[![Build Status](https://github.com/labelzoom/labelzoom-cf-api-gateway/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/labelzoom/labelzoom-cf-api-gateway/actions?query=branch%3Amain)

A Cloudflare Worker that serves as an API Gateway for LabelZoom's public REST API. This project was bootstrapped using the [React + Vite + Hono + Cloudflare Workers](https://github.com/cloudflare/templates/tree/main/vite-react-template) template.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/vite-react-template)

## Development

Install dependencies:

```bash
npm install
```

Start the development server with:

```bash
npm run dev
```

Your application will be available at [http://localhost:5173](http://localhost:5173).

## Production

Build your project for production:

```bash
npm run build
```

Preview your build locally:

```bash
npm run preview
```

Deploy your project to Cloudflare Workers:

```bash
npx wrangler deploy
```

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Vite Documentation](https://vitejs.dev/guide/)
- [React Documentation](https://reactjs.org/)
- [Hono Documentation](https://hono.dev/)
