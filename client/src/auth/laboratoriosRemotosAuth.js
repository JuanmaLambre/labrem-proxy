import axios from "axios";
import { useMutation } from "@tanstack/react-query";

const REMOTOS_URL = "https://laboratorios-remotos-test.fi.uba.ar";

export const useLabRemAuthentication = () =>
  useMutation({
    mutationFn: ({ email, password }) => axios.post(`${REMOTOS_URL}/api/v1/auth/login`, { email, password }),
  });
