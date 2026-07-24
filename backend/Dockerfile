FROM node:20-alpine

WORKDIR /app

# Instala dependências de produção
COPY package.json ./
RUN npm install --omit=dev

# Copia o código fonte
COPY src ./src

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/index.js"]
