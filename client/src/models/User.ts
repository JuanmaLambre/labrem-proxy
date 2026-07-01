export interface UserJSON {
  id: number;
  name: string;
  surname: string;
  email: string;
  dni: string;
}

export class User {
  id: number;
  name: string;
  surname: string;
  email: string;
  dni: string;

  constructor(json: UserJSON) {
    this.id = json.id;
    this.name = json.name;
    this.surname = json.surname;
    this.email = json.email;
    this.dni = json.dni;
  }

  get fullname() {
    if (this.name && this.surname) return `${this.name} ${this.surname}`;
    else return this.name || this.surname;
  }

  toJSON(): UserJSON {
    return {
      id: this.id,
      name: this.name,
      surname: this.surname,
      email: this.email,
      dni: this.dni,
    };
  }
}
