FROM php:8.3-apache-bookworm

ARG SQLSRV_VERSION=5.13.3

RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libonig-dev libxml2-dev libsqlite3-dev unzip git curl ca-certificates unixodbc-dev libgssapi-krb5-2 \
    && docker-php-ext-install pdo_pgsql pdo_sqlite mbstring dom opcache \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

# Keep PostgreSQL/SQLite support and add the Azure SQL PDO driver.
RUN curl --fail --silent --show-error --location https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb --output /tmp/packages-microsoft-prod.deb \
    && dpkg -i /tmp/packages-microsoft-prod.deb \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 \
    && pecl install sqlsrv-${SQLSRV_VERSION} pdo_sqlsrv-${SQLSRV_VERSION} \
    && docker-php-ext-enable sqlsrv pdo_sqlsrv \
    && php -r 'foreach (["sqlite", "pgsql", "sqlsrv"] as $driver) { if (!in_array($driver, PDO::getAvailableDrivers(), true)) { fwrite(STDERR, "Missing PDO driver: ".$driver.PHP_EOL); exit(1); } }' \
    && rm -f /tmp/packages-microsoft-prod.deb \
    && rm -rf /var/lib/apt/lists/* /tmp/pear
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --prefer-dist --no-interaction --no-progress
COPY . .
RUN composer dump-autoload --no-dev --classmap-authoritative \
    && chown -R www-data:www-data storage bootstrap/cache
COPY docker/apache.conf /etc/apache2/sites-available/000-default.conf
COPY docker/production.ini /usr/local/etc/php/conf.d/production.ini
ENV APP_ENV=production APP_DEBUG=false LOG_CHANNEL=stderr
EXPOSE 80
CMD ["apache2-foreground"]
