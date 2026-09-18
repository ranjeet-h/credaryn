ARG DSS_VERSION=6.5

FROM maven:3.9.11-eclipse-temurin-17@sha256:e4a7ace3dc0d645ed97f8d9ad0b0d3f0b14fa8d150138f27f116d7105a639b82 AS build
ARG DSS_VERSION
WORKDIR /build
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests -Ddss.version=${DSS_VERSION} package

FROM eclipse-temurin:17-jdk@sha256:bc033b57e11b773c3043babfd664e7a5ef110805548b921cbfc3e8c67a0725d6
ARG DSS_VERSION
ENV DSS_VERSION=${DSS_VERSION}
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/credaryn
COPY --from=build /build/target/dss-boundary-adapter-0.0.0.jar ./dss-boundary-adapter.jar
COPY healthcheck.sh /usr/local/bin/credaryn-dss-healthcheck
COPY entrypoint.sh /usr/local/bin/credaryn-dss-entrypoint
RUN chmod +x /usr/local/bin/credaryn-dss-healthcheck /usr/local/bin/credaryn-dss-entrypoint
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 CMD ["/usr/local/bin/credaryn-dss-healthcheck"]
ENTRYPOINT ["/usr/local/bin/credaryn-dss-entrypoint"]
