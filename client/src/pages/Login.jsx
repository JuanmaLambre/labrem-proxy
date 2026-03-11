import { useState } from "react";
import classNames from "classnames";
import { useLabRemAuthentication } from "../auth/laboratoriosRemotosAuth";

function Login() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const { mutate: authenticate } = useLabRemAuthentication();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Login attempt:", formData);
    authenticate(formData, {
      onSuccess: (data) => {
        console.log(">>> ", data);
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Labrem Proxy</h1>
        <h2 className="text-xl text-center text-gray-600 mb-6">Login</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="text"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
            />
          </div>

          <button
            type="submit"
            className={classNames(
              "w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-2 px-4 rounded-md",
              "font-medium hover:from-indigo-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500",
              "transition transform hover:-translate-y-0.5 active:translate-y-0",
            )}
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
