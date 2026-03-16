import axios from "axios";
import { useMutation } from "@tanstack/react-query";

const REMOTOS_URL = "https://laboratorios-remotos-test.fi.uba.ar";

interface LoginCredentials {
  email: string;
  password: string;
}

export const useLabRemAuthentication = () =>
  useMutation({
    mutationFn: ({ email, password }: LoginCredentials) =>
      axios.post(`${REMOTOS_URL}/api/v1/auth/login`, { email, password }),
  });
