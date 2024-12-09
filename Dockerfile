FROM node:16-alpine

RUN apk update && apk add --no-cache \
    g++ \
    openjdk11 \
    python3 \
    py3-pip \
    curl \
    unzip \
    && mkdir /opt/cxxtest1 && mkdir cxxtest\
    && curl -L -o /tmp/cxxtest.zip https://github.com/CxxTest/cxxtest/archive/refs/tags/4.4.zip \
    && unzip /tmp/cxxtest.zip -d /opt/cxxtest1 \
    && mv /opt/cxxtest1/cxxtest-4.4/ /opt/cxxtest/ \
    && ln -sf /opt/cxxtest/cxxtest /usr/include/cxxtest \
    && rm -rf /tmp/cxxtest.zip /opt/cxxtest1 \
    && apk del unzip

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install && pip3 install --no-cache-dir pytest

RUN mkdir lib

RUN curl -L -o lib/junit-4.13.2.jar https://repo1.maven.org/maven2/junit/junit/4.13.2/junit-4.13.2.jar && \
    curl -L -o lib/hamcrest-core-1.3.jar https://repo1.maven.org/maven2/org/hamcrest/hamcrest-core/1.3/hamcrest-core-1.3.jar

COPY . .

ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk
ENV PATH=$JAVA_HOME/bin:/opt/cxxtest/bin:$PATH

EXPOSE 3000

CMD ["node", "server.js"]
