interface Registration<T> {
  factory: () => T;
  singleton: boolean;
  instance?: T;
}

export class Container {
  private registrations = new Map<symbol, Registration<unknown>>();

  register<T>(token: symbol, factory: () => T, singleton = false): void {
    this.registrations.set(token, { factory, singleton });
  }

  resolve<T>(token: symbol): T {
    const registration = this.registrations.get(token);

    if (!registration) {
      throw new Error(
        `No registration found for token: ${token.toString()}`,
      );
    }

    if (registration.singleton) {
      if (registration.instance === undefined) {
        registration.instance = registration.factory();
      }
      return registration.instance as T;
    }

    return registration.factory() as T;
  }

  has(token: symbol): boolean {
    return this.registrations.has(token);
  }

  reset(): void {
    this.registrations.clear();
  }
}

export const container = new Container();
