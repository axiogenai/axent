FROM gcc:14-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 openjdk-17-jdk-headless && rm -rf /var/lib/apt/lists/*  && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin sandbox
USER 10001:10001
WORKDIR /workspace
