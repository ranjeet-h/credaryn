ARG DSS_VERSION=6.5

FROM maven:3.9.11-eclipse-temurin-17 AS build
ARG DSS_VERSION
WORKDIR /build
COPY pom.xml .
COPY src ./src
RUN mvn -q -DskipTests -Ddss.version=${DSS_VERSION} package

FROM eclipse-temurin:17-jre
ARG DSS_VERSION
ENV DSS_VERSION=${DSS_VERSION}
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/credaryn
COPY --from=build /build/target/dss-boundary-adapter-0.0.0.jar ./dss-boundary-adapter.jar
COPY healthcheck.sh /usr/local/bin/credaryn-dss-healthcheck
RUN chmod +x /usr/local/bin/credaryn-dss-healthcheck
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 CMD ["/usr/local/bin/credaryn-dss-healthcheck"]
ENTRYPOINT ["java", "-jar", "/opt/credaryn/dss-boundary-adapter.jar"]
