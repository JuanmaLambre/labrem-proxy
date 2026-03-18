export interface ExperienceJSON {
  id: string;
  name: string;
  body: string;
}

export class Experience {
  id: string;
  name: string;
  body: string;

  constructor(json: ExperienceJSON) {
    this.id = json.id;
    this.name = json.name;
    this.body = json.body;
  }

  toJSON(): ExperienceJSON {
    return {
      id: this.id,
      name: this.name,
      body: this.body,
    };
  }
}
