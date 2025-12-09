FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install         

COPY . .

RUN mkdir -p /cache

EXPOSE 3000

CMD ["npm", "run", "dev"]
