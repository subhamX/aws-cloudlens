# dockerfile to deploy agni
FROM oven/bun:latest AS base
WORKDIR /usr/src/app

# Install dependencies
FROM base AS install
# Copy workspace configuration and package files
COPY package.json bun.lock tsconfig.json ./
COPY src/ ./src/
COPY drizzle-db/ ./drizzle-db/

# Install dependencies with workspace support
RUN bun install

# Build the app
FROM base AS build
COPY --from=install /usr/src/app ./

# WORKDIR 
RUN ls -al
RUN ls -al src
RUN ls -al drizzle-db
RUN bun run build

WORKDIR /usr/src/app/src

# Run the app
FROM base AS runtime
COPY --from=build /usr/src/app ./
WORKDIR /usr/src/app/src
USER bun
EXPOSE 3002/tcp
# Use the start script from package.json
CMD ["bun", "run", "telegram-prod"]

