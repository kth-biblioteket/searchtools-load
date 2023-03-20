FROM node:16.13.2

WORKDIR /app

COPY . .

RUN npm install

EXPOSE 80

CMD ["npm", "start"]