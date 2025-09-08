# Use an official Node.js runtime as a parent image
FROM node:20-alpine as builder

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy app source
COPY . .

# Production build
FROM node:20-alpine

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/contexts ./contexts
COPY --from=builder /usr/src/app/src/shapes ./src/shapes
COPY .env.example ./.env

EXPOSE 3000

CMD [ "node", "src/index.js" ]
