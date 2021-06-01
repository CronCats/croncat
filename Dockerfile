# = = = = = = = = = = = = = = = = = = = = = =
# Build Stage - This stage will intall node modules and build for prod
# = = = = = = = = = = = = = = = = = = = = = =
FROM mhart/alpine-node:latest as builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json .
COPY yarn.lock .

RUN yarn

COPY . .

# Build and package the ap into a binary named 'croncat-agent'
RUN yarn package

# Copy the default .env values over
RUN mv .env.example .env

# = = = = = = = = = = = = = = = = = = = = = =
# Run stage
# This stage will run our app
# = = = = = = = = = = = = = = = = = = = = = =
FROM node:alpine

WORKDIR /app

# install required libs
RUN apk update && apk add --no-cache libstdc++ libgcc

# copy prebuilt binary from previous step
COPY --from=builder /app/croncat-agent croncat-agent
COPY --from=builder /app/.env .env

EXPOSE 2000

CMD [ "./croncat-agent" ]