export interface Appender {
		debug(logger: Logger): void;
		info(logger: Logger): void;
		warn(logger: Logger): void;
		error(logger: Logger): void;
}
